// Runs before every test file (jest "setupFiles").

// In-memory AsyncStorage: the session storage imports it, and the native module is absent under Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
