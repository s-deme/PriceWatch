'use client';
import { useActionState } from 'react';
import { action } from '../app/actions';
export function ActionForm({
  children,
  className = '',
  op,
}: {
  children: React.ReactNode;
  className?: string;
  op: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    ok: false,
    message: '',
  });
  return (
    <form action={formAction} className={`action-form ${className}`}>
      <input type="hidden" name="op" value={op} />
      <fieldset disabled={pending}>{children}</fieldset>
      {pending && <p role="status">処理しています…</p>}
      {state.message && (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={state.ok ? 'success' : 'error'}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
