import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'error', onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = {
    error: '#dc2626',
    success: '#16a34a',
    info: '#2563eb',
  }[type];

  const icon = {
    error: '❌',
    success: '✅',
    info: 'ℹ️',
  }[type];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: bgColor,
        color: 'white',
        padding: '12px 20px',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        zIndex: 10000,
        maxWidth: '90%',
        width: 'fit-content',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontFamily: 'Palatino, system-ui, sans-serif',
        fontSize: '14px',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '18px',
          padding: '0 4px',
          marginLeft: '8px',
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
