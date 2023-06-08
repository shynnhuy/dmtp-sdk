export const compareString = (str1: string, str2: string) =>
  typeof str1 === 'string' &&
  typeof str2 === 'string' &&
  str1.toLowerCase() === str2.toLowerCase()
