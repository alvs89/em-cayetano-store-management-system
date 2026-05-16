export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password12',
  'password123',
  'admin123',
  'admin1234',
  'qwerty123',
  'qwerty1234',
  'abcdefgh',
  'abcdefghi',
  'abcdefghij',
  'abcdefg123',
  'abcdef123',
  'abc12345',
  'abc123456',
  'abcd1234',
  'qwertyui',
  'qwertyuiop',
  'asdfghjk',
  'asdfghjkl',
  'zxcvbnm1',
  'zxcvbnm12',
  'letmein123',
  'welcome123',
  'store123',
  'emcayetano',
  'emcayetano123'
]);

const normalizePasswordComparison = value =>
  String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const getAccountTerms = ({ fullName, username, email } = {}) => {
  const terms = [];
  const normalizedUsername = normalizePasswordComparison(username);
  const emailValue = String(email || '').toLowerCase().trim();
  const emailLocalPart = normalizePasswordComparison(emailValue.split('@')[0]);
  const nameParts = String(fullName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(normalizePasswordComparison)
    .filter(part => part.length >= 4);

  if (normalizedUsername.length >= 4) terms.push(normalizedUsername);
  if (emailLocalPart.length >= 4) terms.push(emailLocalPart);
  terms.push(...nameParts);

  return Array.from(new Set(terms));
};

export function validatePasswordPolicy(password, accountDetails = {}) {
  const passwordText = String(password || '');
  const normalizedPassword = normalizePasswordComparison(passwordText);

  if (!passwordText.trim() || !/[a-z0-9]/i.test(passwordText)) {
    return 'Password must include at least one letter or number.';
  }

  if (passwordText.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }

  if (passwordText.length > PASSWORD_MAX_LENGTH) {
    return `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`;
  }

  if (COMMON_PASSWORDS.has(normalizedPassword)) {
    return 'This password is too common. Please choose a stronger password.';
  }

  const matchingAccountTerm = getAccountTerms(accountDetails).find(term => normalizedPassword.includes(term));
  if (matchingAccountTerm) {
    return 'This password is too similar to your account details. Please choose a stronger password.';
  }

  return null;
}

export const PASSWORD_HELP_TEXT =
  'Use 8 to 64 characters and include at least one letter or number. Choose a password that is easy for you to remember but hard for others to guess.';
