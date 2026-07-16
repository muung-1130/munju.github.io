import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      userName: string;
      createdAt: string;
      profileComplete: boolean;
    };
  }

  interface User {
    userName?: string;
    createdAt?: string;
    profileComplete?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    userName?: string;
    createdAt?: string;
    profileComplete?: boolean;
  }
}
