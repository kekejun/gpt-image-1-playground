import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
    // Debug: Log all headers to see what's available
    console.log('=== SSO Auth Status Debug ===');
    console.log('All headers:', Object.fromEntries(request.headers.entries()));
    
    // Azure Static Web Apps provides user info in headers
    const userPrincipal = request.headers.get('x-ms-client-principal');
    console.log('x-ms-client-principal header:', userPrincipal);
    
    if (!userPrincipal) {
        console.log('No user principal found, user not authenticated');
        return NextResponse.json({ 
            authenticated: false, 
            user: null 
        });
    }

    try {
        // Decode the base64 encoded user principal
        const decodedPrincipal = atob(userPrincipal);
        const userInfo: UserInfo = JSON.parse(decodedPrincipal);
        
        // Validate email domain for company access
        const emailClaim = userInfo.claims?.find((c: UserClaim) => c.typ === 'email');
        const userEmail = emailClaim?.val || '';
        
        if (!userEmail.endsWith('@herzogdemeuron.com')) {
            console.log('User not from company domain:', userEmail);
            return NextResponse.json({ 
                authenticated: false, 
                user: null 
            });
        }
        
        return NextResponse.json({
            authenticated: true,
            user: {
                id: userInfo.userId,
                name: userInfo.userDetails,
                email: userEmail,
                provider: userInfo.identityProvider
            }
        });
    } catch (error) {
        console.error('Error parsing user principal:', error);
        return NextResponse.json({ 
            authenticated: false, 
            user: null 
        });
    }
} 