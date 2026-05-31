'use client';

import { useSkrumpeyAccess } from '@/lib/hooks/useSkrumpeyAccess';
import BaseAccessGate from './BaseAccessGate';

interface SkrumpeyAccessGateProps {
  children: React.ReactNode;
  /** Optional custom title for the locked screen */
  title?: string;
  /** Optional custom message for the locked screen */
  message?: string;
}

/**
 * Skrumpey Access Gate — wraps protected content and only shows it to holders of
 * ANY Skrumpey (community check, not just Star). UI lives in BaseAccessGate; this
 * wrapper just supplies the any-Skrumpey access state.
 */
export default function SkrumpeyAccessGate({
  children,
  title = 'ACCESS RESTRICTED',
  message = 'Only Skrumpey holders may enter.',
}: SkrumpeyAccessGateProps) {
  const { hasAccess, isLoading, isConnected } = useSkrumpeyAccess();

  return (
    <BaseAccessGate
      variant="skrumpey"
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
