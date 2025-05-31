# Content Security Policy (CSP) Implementation

This document describes the Content Security Policy (CSP) implementation for the Yitam web application.

## Overview

A Content Security Policy is a security standard that helps prevent various types of attacks, including Cross-Site Scripting (XSS) and data injection attacks. The CSP is implemented in two ways:

1. Server-side via Nginx headers
2. Client-side via meta tags in index.html

## CSP Directives Explained

Our CSP policy includes the following directives:

- `default-src 'self'`: By default, only allow resources from the same origin
- `script-src 'self' https://accounts.google.com https://*.googleapis.com`: Allow JavaScript from own domain and Google services (for authentication)
- `connect-src`: Controls which network resources can be loaded, including API endpoints, WebSockets, and third-party services
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com`: Allow styles from own domain, inline styles, Google Fonts, and Google Sign-In
- `font-src 'self' https://fonts.gstatic.com`: Allow fonts from own domain and Google Fonts
- `img-src 'self' data: https://*.googleusercontent.com`: Allow images from own domain, data URIs, and Google user content
- `frame-src 'self' https://accounts.google.com`: Allow frames from own domain and Google authentication
- `object-src 'none'`: Block all plugins (object, embed, applet)
- `base-uri 'self'`: Restrict base URIs to own domain
- `form-action 'self'`: Restrict form submissions to own domain
- `upgrade-insecure-requests`: Upgrade HTTP requests to HTTPS

## Implementation

### Development Environment

For local development, the CSP includes allowances for localhost connections:

#### Nginx Configuration (Development)

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss://$host ws://$host; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;";
```

#### HTML Meta Tag (Development)

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss: ws:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;">
```

### Production Environment (yitam.org)

For production deployment, we use a more restrictive policy that doesn't include development-specific allowances:

#### Nginx Configuration (Production)

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' https://yitam.org https://api.yitam.org https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss://yitam.org ws://yitam.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;";
```

#### HTML Meta Tag (Production)

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' https://yitam.org https://api.yitam.org https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss://yitam.org ws://yitam.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;">
```

### Hybrid Testing Configuration

For testing purposes, you may want to use a hybrid configuration that works in both production and development environments:

#### Nginx Configuration (Hybrid Testing)

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* https://yitam.org https://api.yitam.org https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss://yitam.org ws://yitam.org wss: ws:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;";
```

#### HTML Meta Tag (Hybrid Testing)

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://accounts.google.com https://*.googleapis.com; connect-src 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* https://yitam.org https://api.yitam.org https://api.anthropic.com https://accounts.google.com https://*.googleapis.com wss://yitam.org ws://yitam.org wss: ws:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;">
```

**Note**: This hybrid configuration is less secure than the production-only version because it allows connections to localhost. It should only be used for testing and not in a public-facing production environment.

## Google Sign-In Requirements

Google Sign-In integration requires several CSP allowances:

1. `script-src` must include `https://accounts.google.com` to load authentication scripts
2. `connect-src` must include `https://accounts.google.com` to allow API connections for authentication flows
3. `style-src` must include `https://accounts.google.com` to load Google Sign-In button styles
4. `frame-src` must include `https://accounts.google.com` to allow authentication popups

Without these allowances, Google Sign-In functionality will be limited or non-functional.

## Development Considerations

When developing or adding new features:

1. If you need to include resources from additional domains, update both the Nginx configuration and HTML meta tag
2. Avoid using inline JavaScript, which violates CSP (use external files instead)
3. If you must use inline JavaScript, consider using a nonce-based approach
4. Test CSP compliance using browser developer tools to identify and fix violations
5. When switching between development and production, ensure you're using the appropriate CSP configuration

## Vite Configuration

To ensure Vite builds are CSP-compliant, the following configuration is applied in vite.config.ts:

```javascript
build: {
  sourcemap: true,
  cssCodeSplit: true,
  rollupOptions: {
    output: {
      inlineDynamicImports: false,
    },
  },
},
```

## Testing CSP Compliance

You can use browser developer tools to check for CSP violations:

1. Open Developer Tools (F12)
2. Go to the Console tab
3. Look for CSP violation messages
4. Adjust the policy as needed to resolve violations

## Production Security Considerations

For the production environment, consider these additional security enhancements:

1. Enable HSTS (HTTP Strict Transport Security) in the Nginx configuration:
   ```nginx
   add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
   ```

2. Consider implementing a report-only CSP in parallel to monitor potential violations:
   ```nginx
   add_header Content-Security-Policy-Report-Only "default-src 'self'; report-uri https://your-reporting-endpoint.com/csp-reports";
   ```

3. Regularly review and update the CSP based on evolving application needs and security best practices

## References

- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator Tool](https://csp-evaluator.withgoogle.com/)
- [Google CSP Starter](https://csp.withgoogle.com/docs/adopting-csp.html) 