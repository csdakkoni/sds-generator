/** CAS Registry Number: two to seven digits, two digits, one check digit. */
const SHAPE = /^\d{2,7}-\d{2}-\d$/;

export function isValidCas(value: string): boolean {
  const cas = value.trim();
  if (!SHAPE.test(cas)) return false;
  const digits = cas.replace(/-/g, '');
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    sum += Number(body[body.length - 1 - i]) * (i + 1);
  }
  return sum % 10 === Number(digits.slice(-1));
}
