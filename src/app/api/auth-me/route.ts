import { NextRequest, NextResponse } from 'next/server';

interface AuthClaim {
    typ: string;
    val: string;
}

interface AuthUser {
    user_id: string;
    identity_provider: string;
    user_claims?: AuthClaim[];
}

export async function GET(request: NextRequest) {
    console.log('=== Auth Me Debug ===');
    
    // Try to access Azure Static Web Apps built-in auth endpoint
    try {
        const authUrl = new URL('/.auth/me', request.url);
        console.log('Trying to fetch:', authUrl.toString());
        
        const response = await fetch(authUrl.toString(), {
            headers: {
                'Cookie': request.headers.get('cookie') || ''
            }
        });
        
        console.log('Auth me response status:', response.status);
        
        if (response.ok) {
            const authData: AuthUser[] = await response.json();
            console.log('Auth me data:', authData);
            
            if (authData && authData.length > 0) {
                const user = authData[0];
                const userEmail = user.user_claims?.find((claim: AuthClaim) => claim.typ === 'email')?.val || '';
                
                // Check Herzog de Meuron email domain
                if (userEmail.endsWith('@herzogdemeuron.com')) {
                    return NextResponse.json({
                        authenticated: true,
                        user: {
                            id: user.user_id,
                            name: user.user_claims?.find((claim: AuthClaim) => claim.typ === 'name')?.val || user.user_id,
                            email: userEmail,
                            provider: user.identity_provider
                        }
                    });
                } else {
                    console.log('User not from company domain:', userEmail);
                    return NextResponse.json({ 
                        authenticated: false, 
                        user: null,
                        reason: 'Invalid email domain'
                    });
                }
            }
        }
        
        return NextResponse.json({ 
            authenticated: false, 
            user: null,
            reason: 'No auth data found'
        });
        
    } catch (error) {
        console.error('Error accessing /.auth/me:', error);
        return NextResponse.json({ 
            authenticated: false, 
            user: null,
            reason: 'Auth check failed',
            error: String(error)
        });
    }
} 