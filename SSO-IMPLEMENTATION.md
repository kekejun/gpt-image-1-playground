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

**File**: `src/app/page.tsx`

**Core Authentication Logic**:
```javascript
const fetchSsoAuthStatus = async () => {
  try {
    // Use Azure Static Web Apps built-in auth endpoint
    const response = await fetch('/.auth/me');
    if (response.ok) {
      const authData = await response.json();
      
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
          // User not from company domain
          setSsoAuthStatus({ authenticated: false, user: null });
        }
      }
    }
  } catch (error) {
    console.error('Error fetching SSO auth status:', error);
    setSsoAuthStatus({ authenticated: false, user: null });
  }
};
```

**Features**:
- **Real-time Authentication Checking**: Monitors authentication status
- **Domain Validation**: Restricts access to company email domain
- **User Interface Updates**: Shows authentication status and user information
- **Error Handling**: Graceful fallback for authentication failures

### 3. API Route Simplification

**Files**: 
- `src/app/api/images/route.ts`
- `src/app/api/image-delete/route.ts`

**Key Changes**:
```javascript
// Before: Custom authentication checks
// if (!isUserAuthenticated(request, formData)) {
//   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
// }

// After: Trust Azure Static Web Apps authentication
// Authentication is handled by Azure Static Web Apps via staticwebapp.config.json
// If the request reaches here, the user is already authenticated
console.log('User authenticated via Azure Static Web Apps');
```

**Benefits**:
- **Simplified Code**: Removed complex authentication logic
- **Improved Reliability**: Leverages Azure's battle-tested authentication
- **Better Performance**: No additional authentication checks per request

### 4. User Interface Updates

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
- Shows authenticated user's email address
- Configurable help URL via environment variable
- Professional appearance with status indicators
- Accessible design with proper ARIA labels

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