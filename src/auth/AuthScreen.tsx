import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { authApi, type ApiError } from '../api/client';
import { loggedIn, useAuth } from './useAuth';
import { ThemeToggle } from '../components/ThemeToggle';
import { useToast } from '../components/Toast';
import './auth.css';

type Mode = 'login' | 'signup' | 'recover';

export const NAME_TAKEN = 'This name already exists, sign up with a different name';

export function AuthScreen({ onDone, embedded }: { onDone?: () => void; embedded?: boolean }) {
  const [mode, setMode] = useState<Mode>('login');
  return (
    <div className={embedded ? 'auth-overlay' : 'auth-page'}>
      {!embedded && (
        <header className="auth-header">
          <div className="brand">
            <img src="/icon.svg" alt="" width={32} height={32} />
            <span>RoomFit</span>
          </div>
          <ThemeToggle />
        </header>
      )}
      <main className="auth-main">
        {!embedded && (
          <div className="auth-intro">
            <h1>Plan your room before you shift</h1>
            <p>Your plans are saved to your account, so you can open them on any device.</p>
          </div>
        )}
        <div className="auth-card">
          <div className="segmented auth-tabs" role="tablist" aria-label="Log in or sign up">
            <button role="tab" aria-pressed={mode === 'login' || mode === 'recover'} aria-selected={mode !== 'signup'} onClick={() => setMode('login')}>
              Log in
            </button>
            <button role="tab" aria-pressed={mode === 'signup'} aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
              Sign up
            </button>
          </div>
          {mode === 'login' && <LoginForm onRecover={() => setMode('recover')} onDone={onDone} />}
          {mode === 'signup' && <SignupForm onDone={onDone} />}
          {mode === 'recover' && <RecoverForm onBack={() => setMode('login')} onDone={onDone} />}
        </div>
      </main>
    </div>
  );
}

// ---------------- shared inputs ----------------

export function PasswordInput(props: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <div className="pw-wrap">
        <input
          id={props.id}
          className={`input${props.invalid ? ' invalid' : ''}`}
          type={show ? 'text' : 'password'}
          value={props.value}
          autoComplete={props.autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <button
          type="button"
          className="icon-btn pw-eye"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="auth-error" role="alert">
      {msg}
    </p>
  );
}

function SubmitButton({ busy, children, disabled }: { busy: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy || disabled}>
      {busy ? <Loader2 size={18} className="spin" /> : null}
      {children}
    </button>
  );
}

// ---------------- log in ----------------

function LoginForm({ onRecover, onDone }: { onRecover: () => void; onDone?: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return setError('Enter your name and password');
    setBusy(true);
    setError(null);
    try {
      const { user } = await authApi.login(name, password);
      loggedIn(user);
      onDone?.();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form" aria-label="Log in">
      <ErrorBox msg={error} />
      <div className="field">
        <label htmlFor="login-name">Name</label>
        <input
          id="login-name"
          className="input"
          value={name}
          maxLength={24}
          autoComplete="username"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <PasswordInput id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <SubmitButton busy={busy}>Log in</SubmitButton>
      <button type="button" className="link-btn" onClick={onRecover}>
        <KeyRound size={15} /> Forgot password? Log in with recovery code
      </button>
    </form>
  );
}

// ---------------- sign up ----------------

type NameState = { state: 'empty' } | { state: 'checking' } | { state: 'free' } | { state: 'bad'; msg: string } | { state: 'offline'; msg: string };

function useNameCheck(name: string): NameState {
  const [st, setSt] = useState<NameState>({ state: 'empty' });
  const seq = useRef(0);
  useEffect(() => {
    const n = name.trim();
    if (!n) return setSt({ state: 'empty' });
    setSt({ state: 'checking' });
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await authApi.nameAvailable(n);
        if (my !== seq.current) return;
        setSt(r.available ? { state: 'free' } : { state: 'bad', msg: r.reason ?? NAME_TAKEN });
      } catch (e) {
        if (my === seq.current) setSt({ state: 'offline', msg: (e as ApiError).message });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [name]);
  return st;
}

function SignupForm({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useNameCheck(name);
  const [takenOnSubmit, setTakenOnSubmit] = useState<string | null>(null);
  useEffect(() => setTakenOnSubmit(null), [name]);

  const nameMsg = takenOnSubmit ?? (check.state === 'bad' || check.state === 'offline' ? check.msg : null);
  const nameFree = check.state === 'free' && !takenOnSubmit;
  const mismatch = confirm.length > 0 && confirm !== password;
  const shortPw = password.length > 0 && password.length < 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameFree) return;
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('The two passwords are not the same');
    setBusy(true);
    setError(null);
    try {
      const { user, recoveryCode } = await authApi.signup(name, password);
      loggedIn(user, recoveryCode);
      onDone?.();
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.code === 'name_taken') setTakenOnSubmit(NAME_TAKEN);
      else setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form" aria-label="Sign up">
      <ErrorBox msg={error} />
      <div className="field">
        <label htmlFor="signup-name">Choose a name</label>
        {/* message above the name box, in red */}
        {nameMsg && (
          <p className="name-error" role="alert" id="signup-name-error">
            {nameMsg}
          </p>
        )}
        <div className="name-wrap">
          <input
            id="signup-name"
            className={`input${nameMsg ? ' invalid' : nameFree ? ' valid' : ''}`}
            value={name}
            maxLength={24}
            autoComplete="username"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={nameMsg ? 'signup-name-error' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="name-state" aria-hidden>
            {check.state === 'checking' && <Loader2 size={18} className="spin" />}
            {nameFree && <Check size={18} />}
          </span>
        </div>
        {nameFree ? <span className="name-ok">This name is free</span> : <span className="hint">3 to 24 letters or numbers. Others can't use the same name.</span>}
      </div>

      {nameFree && (
        <div className="reveal">
          <PasswordInput id="signup-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" invalid={shortPw} />
          {shortPw && <p className="field-error">At least 8 characters</p>}
          <PasswordInput id="signup-confirm" label="Verify password" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={mismatch} />
          {mismatch && <p className="field-error">The two passwords are not the same</p>}
          <SubmitButton busy={busy} disabled={!password || !confirm || mismatch || shortPw}>
            Create account
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

// ---------------- recovery ----------------

function RecoverForm({ onBack, onDone }: { onBack: () => void; onDone?: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return setError('Enter your name and recovery code');
    if (password.length < 8) return setError('New password must be at least 8 characters');
    if (password !== confirm) return setError('The two passwords are not the same');
    setBusy(true);
    setError(null);
    try {
      const { user, recoveryCode } = await authApi.recover(name, code, password);
      loggedIn(user, recoveryCode);
      onDone?.();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="auth-form" aria-label="Log in with recovery code">
      <p className="hint" style={{ marginTop: 0 }}>
        Use the recovery code you wrote down when you signed up. You'll set a new password and get a new code.
      </p>
      <ErrorBox msg={error} />
      <div className="field">
        <label htmlFor="rec-name">Name</label>
        <input id="rec-name" className="input" value={name} maxLength={24} autoComplete="username" autoCorrect="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="rec-code">Recovery code</label>
        <input
          id="rec-code"
          className="input code-input"
          value={code}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <PasswordInput id="rec-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
      <PasswordInput id="rec-confirm" label="Verify new password" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={mismatch} />
      {mismatch && <p className="field-error">The two passwords are not the same</p>}
      <SubmitButton busy={busy}>Log in and set new password</SubmitButton>
      <button type="button" className="link-btn" onClick={onBack}>
        Back to log in
      </button>
    </form>
  );
}

// ---------------- recovery code shown once ----------------

export function RecoveryCodeScreen() {
  const code = useAuth((s) => s.recoveryCode);
  const [saved, setSaved] = useState(false);
  const toast = useToast((s) => s.show);
  if (!code) return null;
  return (
    <div className="overlay" style={{ zIndex: 80 }}>
      <div className="dialog code-dialog" role="dialog" aria-modal="true" aria-label="Your recovery code">
        <ShieldCheck size={36} className="code-icon" />
        <h2>Write down your recovery code</h2>
        <p className="sub">
          If you forget your password, log in with your name and this code on any device. It works <strong>only once</strong>, then you get a new one.
          We can't show it again.
        </p>
        <div className="code-box" data-testid="recovery-code">
          {code}
        </div>
        <button
          className="btn btn-block"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              toast('Code copied');
            } catch {
              toast('Select the code and copy it');
            }
          }}
        >
          <Copy size={17} /> Copy code
        </button>
        <label className="check-row">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have written down or saved my recovery code
        </label>
        <button className="btn btn-primary btn-block" disabled={!saved} onClick={() => useAuth.setState({ recoveryCode: null })}>
          Continue
        </button>
      </div>
    </div>
  );
}
