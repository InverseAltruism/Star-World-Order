'use client';

import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import BaseAccessGate from './BaseAccessGate';

interface AccessGateProps {
  children: React.ReactNode;
  /** Optional custom title for the locked screen */
  title?: string;
  /** Optional custom message for the locked screen */
  message?: string;
}

/**
 * Access Gate — wraps protected content and only shows it to Star Skrumpey
 * holders (the DAO/Star-trait check). Non-holders see the retro "locked" screen.
 * UI lives in BaseAccessGate; this wrapper just supplies the Star access state.
 */
export default function AccessGate({
  children,
  title = 'ACCESS RESTRICTED',
  message = 'Only Star Skrumpey holders may enter.',
}: AccessGateProps) {
  const { hasAccess, isLoading, isConnected } = useDAOAccess();

  return (
    <BaseAccessGate
      variant="star"
      hasAccess={hasAccess}
      isLoading={isLoading}
      isConnected={isConnected}
      title={title}
      message={message}
    >
      {children}
    </BaseAccessGate>
  );
}
