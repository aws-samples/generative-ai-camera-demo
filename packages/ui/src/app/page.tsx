'use client';

import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Card,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Image,
  NumberInput,
  NumberInputField,
  Select,
  Spacer,
  Switch,
  Tag,
  VStack,
  Button
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, useEffect, useState, useRef } from 'react';
import { getPrompts, putPrompt } from './api';
import { fetchAuth } from './auth';
import WebcamComponent from './webcam';


const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT ?? '';
const captionApiEndpoint = `${apiEndpoint}/caption`;
const cloudfrontUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL ?? '';

export default function Home() {
  const [pollingInterval, setPollingInterval] = useState(3000);
  const [isUpdated, setIsUpdated] = useState(true);
  const [caption, setCaption] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [indicator_color, setIndicatorColor] = useState('gray.80');
  const [indicator_label, setIndicatorLabel] = useState('Status');
  const [s3Url, setS3Url] = useState('');
  const [useCamera, setUseCamera] = useState(false);

  const queryClient = useQueryClient();
  const getPromptsQuery = useQuery({
    queryKey: ['prompts'],
    queryFn: getPrompts,
  });
  const selectedId = getPromptsQuery.data?.selectedId;
  const putPromptMutation = useMutation({
    mutationFn: putPrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });

  const fetchData = async () => {
    try {
      const response = await fetchAuth(captionApiEndpoint);
      const data = await response.json();
      setCaption(data['caption']['S']);
      const recog = JSON.parse(
        data['rekognition_labels']['S'].replace(/'/g, '"')
      );
      setLabels(recog['Labels'].map((x: any) => x['Name']));

      // hazardous status indicator
      const classification = data['classification']['S'].trim();
      if (classification == '1') {
        setIndicatorColor('red.500');
        setIndicatorLabel('Status: Caution');
      } else {
        setIndicatorColor('gray.20');
        setIndicatorLabel('Status: Normal');
      }
      // set S3 URL
      const imageFileName = data['s3_location']['S'].split('/').slice(-1)[0];
      setS3Url(`${cloudfrontUrl}images/${imageFileName}`);
    } catch (error) {
      console.error('/stream error', error);
    }
  };

  useEffect(() => {
    if (isUpdated) {
      fetchData();
      const pollingTimer = setInterval(fetchData, pollingInterval);
      return () => {
        clearInterval(pollingTimer);
      };
    }
  }, [pollingInterval, isUpdated]);

  const imageHeight = 320;

  const handleSwitch = () => {
    setIsUpdated(!isUpdated);
  };

  const handleIntervalChange = (interval: string) => {
    setPollingInterval(parseInt(interval));
  };

  const handlePromptSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    putPromptMutation.mutate({
      selectedId: selectedId,
    });
  };

  const handleUseCameraSwitch = () => {
    setUseCamera(!useCamera);
  };

  return (
    <>
      <Box padding={'0.5%'}>
        <Accordion allowToggle marginBottom={'1%'} defaultIndex={0}>
          <AccordionItem>
            <AccordionButton>
              Control Panel
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={4}>
              <VStack>
                <HStack spacing={4}>
                  <Box>
                    <FormControl display={'flex'} alignItems={'center'}>
                      <FormLabel mb={0}>Use Camera</FormLabel>
                      <Switch
                        isChecked={useCamera}
                        onChange={handleUseCameraSwitch}>
                      </Switch>
                    </FormControl>
                  </Box>
                  <Box>
                    <FormControl display={'flex'} alignItems={'center'}>
                      <FormLabel mb={0}>Update Data</FormLabel>
                      <Switch
                        isChecked={isUpdated}
                        onChange={handleSwitch}></Switch>
                    </FormControl>
                  </Box>
                  <Spacer></Spacer>
                  <Box w="300px">
                    <FormControl display={'flex'} alignItems={'center'}>
                      <FormLabel mb={0}>Update Interval (ms): </FormLabel>
                      <NumberInput
                        value={pollingInterval}
                        onChange={handleIntervalChange}>
                        <NumberInputField></NumberInputField>
                      </NumberInput>
                    </FormControl>
                  </Box>
                  <Spacer></Spacer>
                  <Box w="300px">
                    <FormControl display={'flex'} alignItems={'center'}>
                      <FormLabel mb={0}>Prompt: </FormLabel>
                      <Select
                        onChange={handlePromptSelectChange}
                        value={selectedId}>
                        {getPromptsQuery.data?.prompts.map((p) => (
                          <option key={p.id}>{p.id}</option>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </HStack>
              </VStack>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>

        <HStack spacing={'3%'} align={'flex-start'}>
          <Box w={'50%'} margin={'5px'}>
            <VStack spacing={'20px'}>
              <AnnotatedImage
                s3Url={s3Url}
                height={imageHeight}></AnnotatedImage>
              <Spacer></Spacer>
            </VStack>
          </Box>
          <Spacer></Spacer>
          <Box w={'50%'} margin={'5px'}>
            <VStack spacing={'40px'}>
              <VisualChat
                caption={caption}
                labels={labels}
                indicator_color={indicator_color}
                indicator_label={indicator_label}></VisualChat>
            </VStack>
          </Box>
        </HStack>

        {useCamera && <WebcamComponent />}

      </Box>
    </>
  );
}

interface AnnotatedImageProps {
  s3Url: string;
  height: number;
}

function AnnotatedImage(props: AnnotatedImageProps) {
  return (
    <>
      <VStack>
        <Heading size={'lg'} alignItems={'center'}>
          Captured Image with Object Detection
        </Heading>
        <Image
          src={props.s3Url}
          alt="Captured Image with Object Detection"
          height={`${props.height}px`}></Image>
      </VStack>
    </>
  );
}

interface VisualChatProps {
  caption: string;
  labels: string[];
  indicator_color: string;
  indicator_label: string;
}

function VisualChat(props: VisualChatProps) {
  //console.log(props.indicator_color);
  return (
    <>
      <VStack>
        <Heading size={'lg'} alignItems={'center'}>
          Image Description by Generative AI
        </Heading>
        <Card
          variant={'filled'}
          padding={'10px'}
          w={'100%'}
          h={'50px'}
          background={props.indicator_color}>
          <Heading
            size={'md'}
            style={{ whiteSpace: 'pre-line' }}
            alignItems={'center'}>
            {props.indicator_label}
          </Heading>
        </Card>
        <Spacer></Spacer>

        <Card
          variant={'filled'}
          marginTop={'20px'}
          margin={'10px'}
          padding={'10px'}
          w={'100%'}
          h={'400px'}
          overflowY={'auto'}>
          <Heading size={'md'} marginBottom={'10px'} alignItems={'left'}>
            Scene Description:
          </Heading>
          <Heading
            size={'md'}
            marginLeft={'10px'}
            marginRight={'10px'}
            style={{ whiteSpace: 'pre-line' }}>
            {props.caption}
          </Heading>
        </Card>

        <Flex flexWrap={'wrap'}>
          {props.labels &&
            props.labels.map((l) => (
              <Box margin={'10px'} mt={'4px'} mb={'4px'} key={l}>
                <Tag>{l}</Tag>
              </Box>
            ))}
        </Flex>
      </VStack>
    </>
  );
}
