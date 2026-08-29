import { LoginPageClient } from './LoginPageClient';

export default function LoginPage() {
  const demoLoginEnabled = process.env.DEMO_LOGIN_ENABLED === 'true';
  return <LoginPageClient demoLoginEnabled={demoLoginEnabled} />;
}
