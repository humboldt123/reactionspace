from typing import Optional
from fastapi import HTTPException, Depends, Header
from jose import JWTError, jwt
from app.core.config import settings

# Supabase JWT verification
# When a user signs in with Supabase, they get a JWT token
# We need to verify this token and extract the user_id

def get_current_user_id(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Extract and verify JWT token from Authorization header.
    Returns user_id if token is valid, None if in demo mode.
    Raises HTTPException if token is invalid or missing (when not in demo mode).
    """
    # In demo mode, allow anonymous access
    if settings.DEMO_MODE:
        return None

    # Production mode - authentication required
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

    # Parse "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    # Verify JWT token
    try:
        # Supabase uses the JWT secret to sign tokens
        # We need to verify with the JWT secret (not the anon key)
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,  # Use JWT secret for verification
            algorithms=["HS256"],
            audience="authenticated",
        )

        # Extract user_id from the "sub" (subject) claim
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        return user_id

    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def get_current_user_id_optional(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Same as get_current_user_id but doesn't raise error if no token.
    In demo mode: always returns None (anonymous access)
    In production: returns None if no token, or user_id if valid token
    NOTE: This should only be used for read-only endpoints. Write operations should use get_current_user_id.
    """
    # In demo mode, allow anonymous access
    if settings.DEMO_MODE:
        return None

    # Production mode - try to get user_id but don't require it
    if not authorization:
        return None  # No auth provided

    # Parse "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            return None
    except ValueError:
        return None

    # Verify JWT token
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )

        user_id = payload.get("sub")
        return user_id

    except JWTError:
        return None  # Invalid token, treat as unauthenticated
