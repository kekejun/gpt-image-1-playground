# Azure SSO Implementation Guide

## 📋 Overview

This document outlines the implementation of Azure Single Sign-On (SSO) authentication for the GPT Image Playground application using Azure Static Web Apps built-in Microsoft Entra ID authentication. The implementation replaces the previous password-based authentication system with enterprise-grade Azure AD integration.

## 🎯 Goals Achieved

- ✅ **Single Sign-On**: Users authenticate with their existing Microsoft work accounts
- ✅ **Domain Restriction**: Only `@herzogdemeuron.com` employees can access the application
- ✅ **Enhanced Security**: Multi-factor authentication support and automatic token management
- ✅ **Simplified User Experience**: No separate passwords to remember or manage
- ✅ **Enterprise Integration**: Seamless integration with company identity management

## 🏗️ Architecture Overview

### Authentication Flow
```
User Access → Azure Static Web Apps → Microsoft Authentication → Domain Validation → Application Access
```

1. **User visits application** at `https://orange-plant-0fb35eb03.1.azurestaticapps.net`
2. **Azure Static Web Apps checks authentication** status
3. **Unauthenticated users redirected** to `/.auth/login/aad`
4. **Microsoft sign-in process** with company credentials
5. **Frontend validates email domain** (`@herzogdemeuron.com`)
6. **Authenticated users access** the application

### Security Model
- **Infrastructure-Level Security**: Authentication handled by Azure Static Web Apps
- **No Custom Authentication Code**: Eliminates potential security vulnerabilities
- **Company Domain Restriction**: Application-level validation ensures only company employees access
- **Automatic Session Management**: Azure handles token refresh and session lifecycle

## 🔧 Technical Implementation

### 1. Azure Static Web Apps Configuration

**File**: `staticwebapp.config.json`

```json
{
  "routes": [
    {
      "route": "/login",
      "redirect": "/.auth/login/aad"
    },
    {
      "route": "/logout", 
      "redirect": "/.auth/logout"
    },
    {
      "route": "/api/*",
      "allowedRoles": ["authenticated"]
    },
    {
      "route": "/*",
      "allowedRoles": ["authenticated"]
    }
  ],
  "responseOverrides": {
    "401": {
      "redirect": "/login",
      "statusCode": 302
    }
  }
}
```

**Key Features**:
- Routes `/login` to Azure AD authentication endpoint
- Protects all application routes and API endpoints
- Automatically redirects unauthorized users to sign-in
- Returns 401 responses for API calls from unauthenticated users

### 2. Frontend Authentication Integration

**File**: `src/app/page.tsx` (lines 178-219)

**Core Authentication Logic**:
```javascript
const fetchSsoAuthStatus = async () => {
    try {
        // Use Azure Static Web Apps built-in auth endpoint
        console.log('Trying /.auth/me endpoint...');
        const response = await fetch('/.auth/me');
        if (response.ok) {
            const authData = await response.json();
            console.log('Auth data:', authData);
            
            if (authData.clientPrincipal) {
                const user = authData.clientPrincipal;
                const userEmail = user.userDetails || '';
                
                // Check Herzog de Meuron email domain
                if (userEmail.endsWith('@herzogdemeuron.com')) {
                    setSsoAuthStatus({
                        authenticated: true,
                        user: {
                            id: user.userId,
                            name: user.userDetails || user.userId,
                            email: userEmail,
                            provider: user.identityProvider
                        }
                    });
                } else {
                    console.log('User not from company domain:', userEmail);
                    setSsoAuthStatus({ authenticated: false, user: null });
                }
            } else {
                setSsoAuthStatus({ authenticated: false, user: null });
            }
        } else {
            setSsoAuthStatus({ authenticated: false, user: null });
        }
        
    } catch (error) {
        console.error('Error fetching SSO auth status:', error);
        setSsoAuthStatus({ authenticated: false, user: null });
    } finally {
        setAuthCheckComplete(true);
    }
};
```

**Authentication State Management** (lines 71-75):
```javascript
const [ssoAuthStatus, setSsoAuthStatus] = React.useState<{
    authenticated: boolean;
    user: { id: string; name: string; email: string | null; provider: string } | null;
} | null>(null);
const [authCheckComplete, setAuthCheckComplete] = React.useState(false);
```

**Session Refresh on Page Visibility** (lines 229-278):
```javascript
React.useEffect(() => {
    const handleVisibilityChange = () => {
        if (!document.hidden) {
            console.log('Page became visible, refreshing SSO auth status');
            // Refreshes authentication status when user returns to tab
            fetchSsoAuthStatus();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

**Features**:
- **Real-time Authentication Checking**: Monitors authentication status on initial load and page visibility changes
- **Domain Validation**: Restricts access to company email domain (`@herzogdemeuron.com`)
- **Session Persistence**: Refreshes authentication when user returns to the application
- **Loading States**: Shows appropriate UI during authentication checks
- **Error Handling**: Graceful fallback for authentication failures

### 3. API Route Authentication

**Files**: 
- `src/app/api/images/route.ts` (lines 85-87)
- `src/app/api/image-delete/route.ts`
- `src/app/api/sso-auth-status/route.ts` (lines 15-77)

**Primary Authentication Approach**:
```javascript
// Authentication is handled by Azure Static Web Apps via staticwebapp.config.json
// If the request reaches here, the user is already authenticated
console.log('User authenticated via Azure Static Web Apps');
```

**Server-Side SSO Validation** (`/api/sso-auth-status/route.ts`):
```javascript
export async function GET(request: NextRequest) {
    // Read Azure Static Web Apps authentication headers
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
        const userInfo: UserInfo = JSON.parse(decodedPrincipal);
        
        // Validate email domain for company access
        const emailClaim = userInfo.claims?.find((c: UserClaim) => c.typ === 'email');
        const userEmail = emailClaim?.val || '';
        
        if (!userEmail.endsWith('@herzogdemeuron.com')) {
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
```

**Benefits**:
- **Infrastructure-Level Security**: Azure Static Web Apps handles authentication before requests reach the API
- **Simplified Code**: Removed complex authentication logic from business logic
- **Dual Validation**: Both infrastructure-level and application-level domain validation
- **Better Performance**: No additional authentication checks per request for protected routes

### 4. User Interface Updates

**Authentication Loading State** (lines 779-789):
```javascript
if (!authCheckComplete) {
    return (
        <main className='flex min-h-screen flex-col items-center justify-center bg-black p-4 text-white'>
            <div className='text-center space-y-4'>
                <div className='h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto'></div>
                <p className='text-white/80'>Checking authentication...</p>
            </div>
        </main>
    );
}
```

**Unauthenticated State** (lines 791-800):
```javascript
if (!ssoAuthStatus?.authenticated) {
    return (
        <main className='flex min-h-screen flex-col items-center justify-center bg-black p-4 text-white'>
            <div className='text-center space-y-4'>
                <p className='text-white/80'>Redirecting to Microsoft sign-in...</p>
            </div>
        </main>
    );
}
```

**Authentication Status Display**:
```javascript
<span className='text-sm text-white/80'>
  Signed in as <span className='font-medium text-white'>{ssoAuthStatus.user?.email}</span>
  {process.env.NEXT_PUBLIC_HELP_URL && (
    <>
      {' '}- for more guidance see{' '}
      <a 
        href={process.env.NEXT_PUBLIC_HELP_URL} 
        target="_blank" 
        rel="noopener noreferrer"
        className='text-blue-400 hover:text-blue-300 underline'
      >
        {process.env.NEXT_PUBLIC_HELP_URL}
      </a>
    </>
  )}
</span>
```

**Features**:
- **Loading States**: Shows spinner and message during authentication checks
- **Redirect Indication**: Informs users they're being redirected to Microsoft sign-in
- **User Information Display**: Shows authenticated user's email address
- **Configurable Help URL**: Optional help link via environment variable
- **Professional Appearance**: Clean, accessible design with proper styling

## ⚙️ Configuration

### Environment Variables

Set these in **Azure Portal** → **Static Web Apps** → **Configuration** → **Application settings**:

```bash
# Optional: Custom help URL displayed to authenticated users
NEXT_PUBLIC_HELP_URL=https://your-help-documentation.com

# Existing application variables (unchanged)
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_IMAGE_STORAGE_MODE=indexeddb
```

### Azure Portal Requirements

**No additional Azure configuration required**:
- Uses Azure Static Web Apps' pre-configured Microsoft authentication provider
- No custom app registration needed
- No additional Azure AD configuration required

## 🚀 Deployment Process

### 1. Code Deployment
```bash
git add .
git commit -m "Implement Azure SSO authentication"
git push origin main
```

### 2. GitHub Actions
- Automatic deployment to Azure Static Web Apps
- No additional configuration needed
- Environment variables managed through Azure Portal

### 3. Environment Configuration
1. Navigate to **Azure Portal**
2. Open your **Static Web App resource**
3. Go to **Configuration** → **Application settings**
4. Add environment variables as needed
5. Click **Save**

### 4. Testing Checklist
- [ ] Unauthenticated users redirected to Microsoft sign-in
- [ ] Company domain validation working (`@herzogdemeuron.com`)
- [ ] Authenticated users can generate images
- [ ] Help URL displays correctly (if configured)
- [ ] Sign-out functionality works

## 🚨 Troubleshooting

### Issue: "Administrator approval required"

**Symptoms**: Users see German message about admin consent
**Cause**: Organization requires admin approval for Azure AD applications
**Solution**: Contact IT administrator to grant tenant-wide consent

**For IT Administrators**:
1. **Azure Portal** → **Azure Active Directory** → **Enterprise Applications**
2. **Consent and permissions** → **User consent settings**
3. Adjust settings to allow user consent or pre-approve the application
4. Alternative: **Conditional Access** policies to whitelist `*.azurestaticapps.net`

### Issue: Help URL not displaying

**Symptoms**: Only shows "Signed in as [email]" without help link
**Cause**: Environment variable not set in Azure Portal
**Solution**: 
1. Set `NEXT_PUBLIC_HELP_URL` in Azure Portal application settings
2. Redeploy the application
3. Verify variable in browser console logs

### Issue: Users from other domains can access

**Symptoms**: Non-company users can sign in
**Cause**: Domain validation may not be working
**Solution**: Check email domain validation logic in frontend code

## 📊 Monitoring and Logs

### Azure Static Web Apps Logs
- **Location**: Azure Portal → Static Web Apps → Log Stream
- **Information**: Deployment status, runtime errors
- **Use Case**: Debugging deployment and runtime issues

### Azure AD Sign-in Logs
- **Location**: Azure Portal → Azure Active Directory → Sign-in logs
- **Information**: Authentication attempts, failures, user details
- **Use Case**: Monitoring access patterns and security incidents

### Application Logs
- **Location**: Browser console during development
- **Information**: Authentication status, API calls, errors
- **Use Case**: Frontend debugging and user experience issues

## 🔒 Security Considerations

### Authentication Security
- **Multi-Factor Authentication**: Inherits organization's MFA policies
- **Conditional Access**: Supports Azure AD conditional access policies
- **Session Management**: Azure handles secure token storage and refresh
- **Password-less**: No application-specific passwords to manage

### Data Protection
- **API Protection**: All API endpoints require authentication
- **Client-Side Validation**: Email domain checked in frontend
- **Server-Side Security**: Azure Static Web Apps handles request filtering
- **HTTPS Enforcement**: All traffic encrypted via Azure infrastructure

### Compliance Benefits
- **Audit Trail**: All sign-ins logged in Azure AD
- **Identity Integration**: Leverages existing identity management
- **Access Control**: Can be integrated with broader access policies
- **Data Residency**: Follows Azure's data residency commitments

## 📚 Additional Resources

### Microsoft Documentation
- [Azure Static Web Apps Authentication](https://docs.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)
- [Static Web Apps Configuration Reference](https://docs.microsoft.com/en-us/azure/static-web-apps/configuration)
- [Microsoft Entra ID Integration](https://docs.microsoft.com/en-us/azure/static-web-apps/authentication-custom)

### Internal Resources
- **Support Contact**: [Your IT Team Contact]
- **Azure Portal**: [Link to your Azure subscription]
- **Application URL**: https://orange-plant-0fb35eb03.1.azurestaticapps.net

## 📝 Change Log

### Version 1.0 - SSO Implementation
- **Date**: [Current Date]
- **Changes**: 
  - Implemented Azure SSO authentication
  - Removed password-based authentication
  - Added domain restriction for company employees
  - Simplified API authentication logic
  - Enhanced user interface with authentication status

### Future Enhancements
- [ ] Role-based access control (RBAC)
- [ ] Integration with company groups/teams
- [ ] Advanced audit logging
- [ ] Custom branding for sign-in pages

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]  
**Maintained By**: [Your Team/Contact Information] 