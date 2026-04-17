# API Best Practices - Follow This Pattern

When adding new API routes, follow this pattern to prevent user complaints and security issues.

---

## Standard User-Facing API Template

```typescript
// app/api/[feature]/[action]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-security";
import { getUserFacingError } from "@/lib/error-handlers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. AUTHENTICATION - Always verify user first
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult; // User not authenticated
    }
    const { userId: authenticatedUserId } = authResult;

    // 2. PARSE & VALIDATE INPUT
    const body = await req.json();
    const { userId, field1, field2 } = body;

    // Validate required fields
    if (!field1 || !field2) {
      return NextResponse.json(
        { error: "field1 and field2 are required" },
        { status: 400 }
      );
    }

    // 3. USER ISOLATION - Verify user can only access their own data
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot perform action for another user" },
        { status: 403 }
      );
    }

    // 4. BUSINESS LOGIC
    // ... perform your operation ...

    // 5. SUCCESS RESPONSE
    return NextResponse.json({
      success: true,
      message: "Operation completed successfully",
      data: { /* result data */ }
    });

  } catch (err: any) {
    // 6. ERROR HANDLING
    console.error("[v0] API error:", err);
    
    const userError = getUserFacingError(err);
    return NextResponse.json(
      { 
        error: userError.message,
        code: userError.code,
        action: userError.action
      },
      { status: 500 }
    );
  }
}
```

---

## Checklist for New API Routes

- [ ] **Authentication**: Does route use `requireAuth()`?
- [ ] **User Isolation**: Verify user can only access their own data?
- [ ] **Input Validation**: Check all required fields?
- [ ] **Error Handling**: Wrapped in try-catch with descriptive errors?
- [ ] **User-Friendly Messages**: Are error messages helpful to users?
- [ ] **HTTP Status Codes**: Using correct 4xx/5xx codes?
- [ ] **Logging**: Logging errors for debugging?
- [ ] **Success Response**: Returning clear success message?

---

## Common Patterns

### Pattern 1: User-Owned Resource (Most Common)
```typescript
if (userId !== authenticatedUserId) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### Pattern 2: Get Current User's Data
```typescript
const { userId: currentUserId } = authResult;
// Use currentUserId automatically - don't accept userId from request
```

### Pattern 3: Admin-Only Operation
```typescript
const adminResult = await requireAdminAuth(req);
if (adminResult instanceof NextResponse) return adminResult;
```

### Pattern 4: Validate Input Format
```typescript
import { validateEmail, validateWalletAddress } from "@/lib/form-validation";

if (!validateEmail(email)) {
  return NextResponse.json(
    { error: "Invalid email format" },
    { status: 400 }
  );
}
```

---

## Error Response Format

All error responses should follow this format:

```typescript
// Client-side readable
{
  "error": "User-friendly message here",
  "code": "ERROR_CODE", // For client-side handling
  "action": "What to do next" // Optional, helpful hint
}

// Examples
{ error: "Invalid email format", code: "VALIDATION_ERROR", action: "Please enter a valid email" }
{ error: "You already submitted this task today", code: "DUPLICATE_ACTION", action: "Try again tomorrow" }
{ error: "Your session expired", code: "UNAUTHORIZED", action: "Please sign in again" }
```

---

## Success Response Format

```typescript
{
  "success": true,
  "message": "User-friendly confirmation",
  "data": { /* optional result data */ }
}
```

---

## Common Pitfalls to Avoid

### ❌ DON'T
```typescript
// Missing auth
export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  // ❌ Anyone can pass any userId

// Silent failure
const { error } = await db.update(...);
// ❌ If error exists, user never knows

// Generic error
catch (err) {
  return NextResponse.json({ error: "Server error" });
  // ❌ Unhelpful to user
}
```

### ✅ DO
```typescript
// Verify auth + user isolation
const authResult = await requireAuth(req);
if (authResult instanceof NextResponse) return authResult;
if (userId !== authResult.userId) return forbidden();

// Handle errors
const { error } = await db.update(...);
if (error) {
  const userError = getUserFacingError(error);
  return NextResponse.json({ error: userError.message }, { status: 500 });
}

// Confirm success
return NextResponse.json({ 
  success: true, 
  message: "Changes saved successfully"
});
```

---

## Database Column Name Handling

If querying columns with typos (legacy):
```typescript
// Don't change column names - they're in the DB as-is
const { data } = await supabase
  .from("users")
  .select("withdwals_fronzen, has_opertor_license") // Use exact names
  .eq("id", userId);

// Map to proper names in response if needed
const response = {
  withdrawalsFrozen: data.withdwals_fronzen, // ← map to proper name
  hasOperatorLicense: data.has_opertor_license
};
```

---

## Testing Your API

```typescript
// Test 1: Unauthorized access
GET /api/feature/action → Should return 401

// Test 2: User isolation
POST /api/feature/action
Body: { userId: "OTHER_USER_ID" }
→ Should return 403 Forbidden

// Test 3: Invalid input
POST /api/feature/action
Body: { } // Missing required fields
→ Should return 400 with specific field errors

// Test 4: Success
POST /api/feature/action
Body: { userId: "CURRENT_USER", ...valid data }
→ Should return { success: true, message: "..." }

// Test 5: Error handling
POST /api/feature/action
Body: { userId: "CURRENT_USER", ...invalid data }
→ Should return user-friendly error message
```

---

## Debugging Tips

1. **Check logs**: Look for "[v0]" tagged logs in server console
2. **Test with curl/Postman**: Test API in isolation with auth header
3. **Check token**: Verify Supabase token is being sent
4. **Verify user isolation**: Ensure request.userId matches auth.userId
5. **Check database**: Verify column names match schema exactly

