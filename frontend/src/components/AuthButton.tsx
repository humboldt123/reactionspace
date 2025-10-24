import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FaGoogle, FaSignOutAlt, FaUser, FaCog } from 'react-icons/fa';

interface AuthButtonProps {
  onAccountClick?: () => void;
}

export function AuthButton({ onAccountClick }: AuthButtonProps) {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Failed to sign in:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowUserMenu(false);
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  if (!user) {
    return (
      <button
        onClick={handleSignIn}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: '0.9em',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
        }}
      >
        <FaGoogle size={16} />
        <span>Sign In</span>
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowUserMenu(!showUserMenu)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: '0.9em',
        }}
      >
        {user.user_metadata?.avatar_url ? (
          <img
            src={user.user_metadata.avatar_url}
            alt="Profile"
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
            }}
          />
        ) : (
          <FaUser size={16} />
        )}
        <span>{user.user_metadata?.name || user.email}</span>
      </button>

      {showUserMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            onClick={() => setShowUserMenu(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99,
            }}
          />

          {/* User menu dropdown */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              minWidth: '200px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.85em',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                {user.user_metadata?.name || 'User'}
              </div>
              <div>{user.email}</div>
            </div>

            <button
              onClick={() => {
                setShowUserMenu(false);
                onAccountClick?.();
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '0.9em',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <FaCog size={14} />
              <span>Account Settings</span>
            </button>

            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '0.9em',
                color: '#ef4444',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <FaSignOutAlt size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
