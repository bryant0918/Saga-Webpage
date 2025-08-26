# Security Policy

**Document Version:** 1.0  
**Last Updated:** August 26, 2025  
**Next Review Date:** February 26, 2026  
**Approved By:** Management  
**Effective Date:** August 26, 2025

## 1. Purpose and Scope

This Security Policy establishes the security requirements and guidelines for our application's integration with FamilySearch services. This policy ensures compliance with FamilySearch compatibility requirements and protects user data and authentication credentials.

**Scope:** This policy applies to all employees, contractors, and systems involved in the development, deployment, and maintenance of applications that integrate with FamilySearch APIs.

## 2. FamilySearch Integration Security Requirements

### 2.1 Access Token Management

**Requirement:** Each user must obtain a FamilySearch access token to read or write to the Family Tree.

**Policy:**
- All users must authenticate through FamilySearch's official OAuth 2 authentication system
- Access tokens must be obtained directly from FamilySearch for each user session
- No shared or system-wide access tokens are permitted
- Access tokens must be treated as sensitive credentials

### 2.2 Access Token Protection

**Requirement:** Access tokens must be protected, and cookies containing access tokens must be secure.

**Policy:**
- All cookies that contain or provide access to FamilySearch access tokens MUST be marked as secure cookies
- Secure cookies must include the following attributes:
  - `Secure` flag (transmitted only over HTTPS)
  - `HttpOnly` flag (not accessible via JavaScript)
  - `SameSite=Strict` or `SameSite=Lax` as appropriate
- Access tokens must never be:
  - Stored in local storage or session storage
  - Transmitted via URL parameters
  - Logged in application logs
  - Exposed in client-side JavaScript variables

### 2.3 Network Security

**Requirement:** Network traffic must be encrypted with SSL from end user to FamilySearch API.

**Policy:**
- All communication with FamilySearch APIs MUST use HTTPS (SSL/TLS encryption)
- Minimum TLS version 1.2 is required
- Certificate validation must be enforced
- No fallback to unencrypted HTTP connections is permitted
- All user-facing pages that handle FamilySearch authentication must be served over HTTPS

### 2.4 User Authentication

**Requirement:** User authentication must be completed by directly calling FamilySearch Third-Party User Authentication web page using OAuth 2.

**Policy:**
- Authentication MUST use FamilySearch's official OAuth 2 implementation
- Users must be redirected to FamilySearch's authentication pages
- No custom login forms for FamilySearch credentials are permitted
- OAuth 2 authorization code flow must be implemented correctly
- State parameters must be used to prevent CSRF attacks

### 2.5 Credential Storage Restrictions

**Requirements:** Specific restrictions on what can and cannot be stored.

**Policy - PROHIBITED:**
- Storage of FamilySearch usernames or passwords is strictly forbidden
- Permanent storage of FamilySearch API Session IDs is prohibited
- Any caching or persistence of user credentials beyond the active session

**Policy - PERMITTED:**
- FamilySearch Person ID numbers may be stored by the application
- Temporary session data may be maintained during active user sessions
- Application-specific user preferences and settings (non-credential data)

### 2.6 Session Management

**Requirement:** FamilySearch session cookies must be secure, and no permanent storage of session IDs.

**Policy:**
- All FamilySearch session cookies MUST be secure cookies with appropriate flags
- Session cookies must have appropriate expiration times
- Sessions must be invalidated upon user logout
- No persistent storage of FamilySearch session identifiers
- Session data must be cleared when sessions expire or are terminated

### 2.7 Refresh Token Usage

**Requirement:** Refresh tokens can be used for selected confidential clients on a case-by-case basis.

**Policy:**
- Refresh token usage requires explicit approval and service account setup
- Refresh tokens may only be used for confidential client applications
- Each use case must be evaluated and approved individually
- Refresh tokens must be stored securely and encrypted at rest
- Access to refresh tokens must be logged and monitored

### 2.8 Native App User Consent

**Requirement:** Native Apps must request acceptance to specific information disclosure.

**Policy:**
- All native applications must display the following consent message before authentication:
  - "[Product Name] would like to know your basic FamilySearch profile information and access data about your ancestors from the FamilySearch family tree."
  - "[Product Name] will use this information in accordance with their respective terms of service and privacy policies."
- The consent message must be clearly visible and prominently displayed
- Users must explicitly accept these terms before proceeding with authentication
- The authentication button must be labeled "Accept and Sign in with FamilySearch" or similar language indicating consent
- Consent must be obtained each time a new authentication session is initiated
- The consent language must not be modified without FamilySearch approval

## 3. Security Implementation Guidelines

### 3.1 Development Practices

- All developers must be trained on FamilySearch security requirements
- Code reviews must include security verification for FamilySearch integration points
- Security testing must be performed before deployment
- Regular security assessments of FamilySearch integration components

### 3.2 Monitoring and Logging

- Authentication attempts and failures must be logged
- Access token usage patterns should be monitored for anomalies
- Security incidents must be reported immediately
- Regular audits of FamilySearch integration security controls

### 3.3 Incident Response

- Security incidents involving FamilySearch data must be reported within 24 hours
- Incident response procedures must include FamilySearch notification requirements
- Post-incident reviews must evaluate FamilySearch security control effectiveness

## 4. Compliance and Governance

### 4.1 Policy Review

- This policy must be reviewed every 6 months
- Reviews must include assessment of FamilySearch requirement changes
- Updates must be approved by management before implementation
- All employees must be notified of policy changes

### 4.2 Training and Awareness

- All employees working with FamilySearch integration must complete security training
- Annual refresher training is required
- New employees must complete training before accessing FamilySearch systems
- Training records must be maintained

### 4.3 Compliance Monitoring

- Regular compliance assessments must be conducted
- Non-compliance issues must be addressed immediately
- Compliance status must be reported to management quarterly
- External audits may be conducted as required

## 5. Roles and Responsibilities

### 5.1 Management
- Approve and support this security policy
- Ensure adequate resources for security implementation
- Review and approve policy updates
- Oversee compliance monitoring

### 5.2 Development Team
- Implement security controls according to this policy
- Participate in security training
- Report security concerns immediately
- Follow secure coding practices

### 5.3 Security Team
- Monitor compliance with this policy
- Conduct security assessments
- Provide security guidance and training
- Investigate security incidents

## 6. Policy Violations

Violations of this security policy may result in:
- Immediate suspension of FamilySearch integration access
- Disciplinary action up to and including termination
- Legal action if required by law or contract
- Notification to FamilySearch as required

## 7. Related Documents

- FamilySearch API Documentation
- OAuth 2.0 Implementation Guidelines
- Application Security Standards
- Incident Response Procedures
- Data Protection Policy

## 8. Policy Approval

This policy has been reviewed and approved by management and is effective as of the date specified above.

**Management Approval:** [To be signed]  
**Date:** August 26, 2025

---

**Document Control:**
- This document is controlled and maintained by the Security Team
- Unauthorized modifications are prohibited
- Current version is available in the project repository
- Previous versions are archived for compliance purposes
