import base from '@wagen/config/eslint/base';
import next from 'eslint-config-next';

export default [
  ...base,
  ...next,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
