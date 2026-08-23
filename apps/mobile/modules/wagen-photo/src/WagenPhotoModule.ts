import { requireNativeModule } from 'expo';

interface WagenPhotoNative {
  isSubjectSegmentationAvailable(): Promise<boolean>;
  requestSegmentationModule(): Promise<boolean>;
  processPhoto(uri: string): Promise<string>;
}

export default requireNativeModule<WagenPhotoNative>('WagenPhoto');
