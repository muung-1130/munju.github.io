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
<<<<<<< HEAD
      dong: string | null;
=======
>>>>>>> origin/main
    };
  }

  interface User {
    userName?: string;
    createdAt?: string;
    profileComplete?: boolean;
<<<<<<< HEAD
    dong?: string | null;
=======
>>>>>>> origin/main
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    userName?: string;
    createdAt?: string;
    profileComplete?: boolean;
<<<<<<< HEAD
    dong?: string | null;
=======
>>>>>>> origin/main
  }
}
