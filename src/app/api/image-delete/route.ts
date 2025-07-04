import crypto from 'crypto';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

const outputDir = path.resolve(process.cwd(), 'generated-images');

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

type DeleteRequestBody = {
    filenames: string[];
    passwordHash?: string;
};

type FileDeletionResult = {
    filename: string;
    success: boolean;
    error?: string;
};

interface UserClaim {
    typ: string;
    val: string;
}

interface UserInfo {
    userId: string;
    userDetails: string;
    identityProvider: string;
    claims?: UserClaim[];
}

function isUserAuthenticated(request: NextRequest, requestBody: { passwordHash?: string }): boolean {
    // Check SSO authentication first
    const userPrincipal = request.headers.get('x-ms-client-principal');
    if (userPrincipal) {
        try {
            const decodedPrincipal = atob(userPrincipal);
            const userInfo: UserInfo = JSON.parse(decodedPrincipal);
            if (userInfo.userId) {
                // Validate tenant if AZURE_TENANT_ID is set
                if (process.env.AZURE_TENANT_ID) {
                    const tenantClaim = userInfo.claims?.find((c: UserClaim) => c.typ === 'tid');
                    if (!tenantClaim || tenantClaim.val !== process.env.AZURE_TENANT_ID) {
                        console.log('User not from authorized tenant:', tenantClaim?.val);
                        return false;
                    }
                }
                console.log('User authenticated via SSO:', userInfo.userDetails);
                return true;
            }
        } catch (error) {
            console.error('Error parsing SSO user principal:', error);
        }
    }

    // Fallback to password authentication
    if (process.env.APP_PASSWORD) {
        const clientPasswordHash = requestBody.passwordHash as string | null;
        if (clientPasswordHash) {
            const serverPasswordHash = sha256(process.env.APP_PASSWORD);
            if (clientPasswordHash === serverPasswordHash) {
                console.log('User authenticated via password');
                return true;
            }
        }
    }

    return false;
}

export async function POST(request: NextRequest) {
    console.log('Received POST request to /api/image-delete');

    let requestBody: DeleteRequestBody;
    try {
        // Read the request body for processing
        requestBody = await request.json();
        
        // Check authentication (SSO or password)
        if (!isUserAuthenticated(request, requestBody)) {
            console.error('User not authenticated for delete operation.');
            return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
        }
    } catch (e) {
        console.error('Error parsing request body for /api/image-delete:', e);
        return NextResponse.json({ error: 'Invalid request body: Must be JSON.' }, { status: 400 });
    }

    const { filenames } = requestBody;

    if (!Array.isArray(filenames) || filenames.some((fn) => typeof fn !== 'string')) {
        return NextResponse.json({ error: 'Invalid filenames: Must be an array of strings.' }, { status: 400 });
    }

    if (filenames.length === 0) {
        return NextResponse.json({ message: 'No filenames provided to delete.', results: [] }, { status: 200 });
    }

    const deletionResults: FileDeletionResult[] = [];

    for (const filename of filenames) {
        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            console.warn(`Invalid filename for deletion: ${filename}`);
            deletionResults.push({ filename, success: false, error: 'Invalid filename format.' });
            continue;
        }

        const filepath = path.join(outputDir, filename);

        try {
            await fs.unlink(filepath);
            console.log(`Successfully deleted image: ${filepath}`);
            deletionResults.push({ filename, success: true });
        } catch (error: unknown) {
            console.error(`Error deleting image ${filepath}:`, error);
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
                deletionResults.push({ filename, success: false, error: 'File not found.' });
            } else {
                deletionResults.push({ filename, success: false, error: 'Failed to delete file.' });
            }
        }
    }

    const allSucceeded = deletionResults.every((r) => r.success);

    return NextResponse.json(
        {
            message: allSucceeded ? 'All files deleted successfully.' : 'Some files could not be deleted.',
            results: deletionResults
        },
        { status: allSucceeded ? 200 : 207 } // 207 Multi-Status if some failed
    );
}
