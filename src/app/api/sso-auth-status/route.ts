import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    // Azure Static Web Apps provides user info in headers
    const userPrincipal = request.headers.get('x-ms-client-principal');
    
    if (!userPrincipal) {
        return NextResponse.json({ 
            authenticated: false, 
            user: null 
        });
    }

    try {
        // Decode the base64 encoded user principal
        const decodedPrincipal = atob(userPrincipal);
        const userInfo = JSON.parse(decodedPrincipal);
        
        // Validate tenant if AZURE_TENANT_ID is set
        if (process.env.AZURE_TENANT_ID) {
            const tenantClaim = userInfo.claims?.find((c: any) => c.typ === 'tid');
            if (!tenantClaim || tenantClaim.val !== process.env.AZURE_TENANT_ID) {
                console.log('User not from authorized tenant:', tenantClaim?.val);
                return NextResponse.json({ 
                    authenticated: false, 
                    user: null 
                });
            }
        }
        
        return NextResponse.json({
            authenticated: true,
            user: {
                id: userInfo.userId,
                name: userInfo.userDetails,
                email: userInfo.claims?.find((c: any) => c.typ === 'email')?.val || null,
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