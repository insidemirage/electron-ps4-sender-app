import * as yup from 'yup';

export const packageSchema = yup
  .object()
  .typeError(
    'Expected member of array to be {path: string; name: string;} object'
  )
  .shape({
    path: yup.string().required('Not found path at one of the array members'),
    name: yup.string().required('Not found name at one of the array members'),
  });

export const addPackagesSchema = yup
  .array()
  .typeError('Expected payload to be array!')
  .of(packageSchema);
