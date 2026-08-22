import base from '@wagen/config/eslint/base';

export default [...base, { ignores: ['.expo/**', 'expo-env.d.ts', 'metro.config.js'] }];
