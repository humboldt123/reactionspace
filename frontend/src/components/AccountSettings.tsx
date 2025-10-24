import { useState } from 'react';
import type { User } from '@supabase/supabase-js';

interface AccountSettingsProps {
  user: User;
  onClose: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  storageUsed: number; // in bytes
  storageLimit: number; // in bytes
  isDemoMode: boolean;
  globalWarning?: boolean;
  globalUsedBytes?: number;
}

export function AccountSettings({
  user,
  onClose,
  onSignOut,
  onDeleteAccount,
  storageUsed,
  storageLimit,
  isDemoMode,
  globalWarning,
  globalUsedBytes,
}: AccountSettingsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const storagePercent = Math.min((storageUsed / storageLimit) * 100, 100);
  const storageUsedMB = (storageUsed / (1024 * 1024)).toFixed(1);
  const storageLimitMB = (storageLimit / (1024 * 1024)).toFixed(0);

  const accountType = isDemoMode ? 'Demo' : 'Free';

  const handleDeleteAccount = () => {
    if (showDeleteConfirm) {
      onDeleteAccount();
    } else {
      setShowDeleteConfirm(true);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 3000,
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: '450px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '24px',
          zIndex: 3001,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.3em' }}>Account Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5em',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* User Info */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: 4 }}>
            Email
          </div>
          <div style={{ fontSize: '0.95em' }}>{user.email}</div>
        </div>

        {/* Account Type */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: 4 }}>
            Account Type
          </div>
          <div style={{ fontSize: '0.95em', marginBottom: 8 }}>
            <span style={{
              backgroundColor: accountType === 'Pro' ? 'var(--accent)' : 'var(--bg-tertiary)',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: '0.9em',
            }}>
              {accountType}
            </span>
          </div>
          {accountType !== 'Pro' && (
            <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>
              Interested in Pro? Email <a href="mailto:vish@reactionspace.app" style={{ color: 'var(--accent)' }}>vish@reactionspace.app</a>
            </div>
          )}
        </div>

        {/* Storage Usage */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.85em',
            color: 'var(--text-secondary)',
            marginBottom: 6
          }}>
            <span>Storage Used</span>
            <span>{storageUsedMB} MB / {storageLimitMB} MB</span>
          </div>

          {/* Storage Bar */}
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${storagePercent}%`,
              height: '100%',
              backgroundColor: storagePercent > 90 ? '#ef4444' : storagePercent > 75 ? '#f59e0b' : 'var(--accent)',
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Global Storage Warning */}
          {globalWarning && globalUsedBytes && (
            <div style={{
              marginTop: 8,
              padding: '8px 12px',
              backgroundColor: '#f59e0b20',
              border: '1px solid #f59e0b',
              borderRadius: 4,
              fontSize: '0.75em',
              color: '#f59e0b',
            }}>
              ⚠️ Global storage approaching Supabase free tier limit (1GB). Currently at {(globalUsedBytes / (1024 * 1024 * 1024)).toFixed(2)}GB.
            </div>
          )}
        </div>

        {/* About */}
        <div style={{
          marginBottom: '24px',
          padding: '12px',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: 6,
          fontSize: '0.85em',
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>About ReactionSpace</div>
          <div style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            A spatial canvas for organizing and discovering your reaction images and videos.
            Built with semantic search and AI-powered tagging.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onSignOut}
            style={{
              width: '100%',
              padding: '10px',
            }}
          >
            Sign Out
          </button>

          <button
            onClick={handleDeleteAccount}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: showDeleteConfirm ? '#ef4444' : 'var(--bg-tertiary)',
              color: showDeleteConfirm ? 'white' : 'var(--text-primary)',
              border: showDeleteConfirm ? 'none' : '1px solid var(--border)',
            }}
          >
            {showDeleteConfirm ? 'Click Again to Confirm Delete' : 'Delete Account'}
          </button>

          {showDeleteConfirm && (
            <div style={{ fontSize: '0.8em', color: '#ef4444', textAlign: 'center' }}>
              This will permanently delete all your data, including all uploaded media.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
