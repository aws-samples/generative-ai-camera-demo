import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { fetchAuth } from './auth';
import { Button, Box, Flex, useToast, Spinner, VStack, HStack, Heading, Select } from '@chakra-ui/react';

const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT ?? '';
const captionApiEndpoint = `${apiEndpoint}/camera`;

const WebcamComponent: React.FC = () => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    async function getCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error('An error occurred during camera enumeration:', err);
      }
    }
    getCameras();
  }, []);

  const handleCameraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDeviceId(event.target.value);
  };

  const resizeImage = (imageSrc: string, targetWidth: number, targetHeight: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
  
        if (ctx) {
          const aspectRatio = targetWidth / targetHeight;
          let sourceWidth = img.width;
          let sourceHeight = img.height;
          let sourceX = 0;
          let sourceY = 0;
  
          if (img.width / img.height > aspectRatio) {
            sourceWidth = img.height * aspectRatio;
            sourceX = (img.width - sourceWidth) / 2;
          } else {
            sourceHeight = img.width / aspectRatio;
            sourceY = (img.height - sourceHeight) / 2;
          }
  
          ctx.drawImage(
            img,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            targetWidth,
            targetHeight
          );
        }
  
        resolve(canvas.toDataURL('image/jpeg'));
      };
      img.src = imageSrc;
    });
  };

  const captureAndUpload = useCallback(async () => {
    setIsProcessing(true);
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      try{
        const resizedImage = await resizeImage(imageSrc, 1280, 960);
        
        // In order for HttpAPI's automatic base64decode to work properly , remove the prefix
        const base64Data = resizedImage.replace(/^data:image\/\w+;base64,/, '');

        const response = await fetchAuth(captionApiEndpoint, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              image: base64Data,
              fileName: `image_${Date.now()}.jpg`,
            }),
        });
        
        if (response.ok) {
          toast({
            title: "Successful upload!",
            description: "The image upload process to S3 has been completed.",
            status: "success",
            duration: 3000,
            isClosable: true,
          });
        } else {
          throw new Error('Upload failed.');
        }
      } catch (error) {
        console.error('Upload error:', error);
        toast({
          title: "Upload error",
          description: "Failed to upload to S3.",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      } finally {
        setIsProcessing(false);
      }
    } 
  }, [webcamRef, toast]);

  return (
    <Flex>
      <HStack w="100%">
        <VStack w="10%">
          <Select value={selectedDeviceId} onChange={handleCameraChange}>
            {devices.map((device, key) => (
              <option value={device.deviceId} key={device.deviceId}>
                {device.label || `カメラ ${key + 1}`}
              </option>
            ))}
          </Select>
          <Button
            onClick={captureAndUpload} 
            colorScheme="blue"
            isDisabled={isProcessing} 
            width="full"
            >
            {isProcessing ? <Spinner size="sm" /> : 'Capture and Upload'}
          </Button>
        </VStack>
        <HStack w="40%">
          <Box>
            <Heading size={'md'} alignItems={'flex-start'}>
              Camera
            </Heading>
            <Webcam
              audio={false}
              ref={webcamRef}
              videoConstraints={{ deviceId: selectedDeviceId }}
              screenshotFormat="image/jpeg"
              style={{
                height:"480px"
              }}
            />
          </Box>
        </HStack>
      </HStack>
    </Flex>
  );
};

export default WebcamComponent;
