export function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 5) errors.push('비밀번호는 5자 이상이어야 해요.');
  if (!/[A-Za-z]/.test(password)) errors.push('영문을 포함해주세요.');
  if (!/[0-9]/.test(password)) errors.push('숫자를 포함해주세요.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('특수기호를 포함해주세요.');
  return errors;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateNickname(nickname: string): string[] {
  const errors: string[] = [];
  if (nickname.length > 15) errors.push('닉네임은 15자 이내로 입력해주세요.');
  return errors;
}

export function validateUsername(username: string): string[] {
  const errors: string[] = [];
  if (username.length < 4) errors.push('아이디는 4자 이상이어야 해요.');
  if (!/^[a-zA-Z0-9_]+$/.test(username)) errors.push('아이디는 영문, 숫자, _만 사용할 수 있어요.');
  return errors;
}
