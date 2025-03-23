export const logError = (msg: string, error?: unknown): void => {
  if (error) {
    console.error(`${msg}:`, error);
  } else {
    console.error(msg);
  }
};
