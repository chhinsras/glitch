import { Link } from '@chakra-ui/next-js';
import {
  Box,
  Button,
  chakra,
  Divider,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Account } from 'appwrite';
import { useRouter } from 'next/router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { FaGithub } from 'react-icons/fa';
import Layout from '../../components/Layout';
import { useUser } from '../../context/UserContext';
import { client } from '../../utils/appwriteConfig';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { setCurrentUser, currentUser } = useUser();

  const account = useMemo(() => new Account(client), []);
  useEffect(() => {
    if (currentUser) {
      router.replace('/');
    }
  }, [currentUser, router]);

  const handleSignIn = () => {
    const promise = account.createEmailSession(email, password);

    promise.then(
      function (response) {
        account.get().then((accountResponse) => {
          setCurrentUser(accountResponse);
          router.push('/');
        });
      },
      function (error) {
        console.log(error);
        setError(error.message);
        setCurrentUser(undefined);
      }
    );
  };

  const handleGithubSignIn = () => {
    const account = new Account(client);
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://appwrite-five.vercel.app'
        : 'http://localhost:3000';

    account.createOAuth2Session('github', baseUrl, `${baseUrl}/login`);
  };

  return (
    <Box bgGradient="linear(to-b, green.500, gray.800)" py={12} h="full">
      <Box
        maxW="xl"
        mx="auto"
        px={24}
        py={8}
        borderRadius="md"
        boxShadow="md"
        bg="black"
      >
        <chakra.h1 fontSize="4xl" mb={8} fontWeight="bold" textAlign="center">
          Login to Glitch
        </chakra.h1>
        <Button
          colorScheme="transparent"
          mb={4}
          w="full"
          borderRadius="full"
          color="green.500"
          borderWidth={2}
          borderColor="green.500"
          onClick={handleGithubSignIn}
        >
          <FaGithub style={{ marginRight: '0.5em' }} />
          Continue With Github
        </Button>
        <Flex align="center" justify="center" my={4}>
          <Divider flex="1" bgColor="gray.300" />
          <Text mx={2} color="gray.300" fontWeight="bold" fontSize="sm">
            or
          </Text>
          <Divider flex="1" bgColor="gray.300" />
        </Flex>
        <FormControl id="email" mb={4}>
          <FormLabel>Email address</FormLabel>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormControl>
        <FormControl id="password" mb={6}>
          <FormLabel>Password</FormLabel>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormControl>
        {error && (
          <Text my={4} textAlign="center" color="red.500">
            {error}
          </Text>
        )}
        <Button
          colorScheme="whatsapp"
          onClick={handleSignIn}
          mb={4}
          w="full"
          borderRadius="full"
          fontWeight="bold"
        >
          Log In
        </Button>
        <Button
          variant="link"
          colorScheme="white"
          _hover={{ color: 'green.500' }}
          w="full"
          my={8}
        >
          Forgot your password?
        </Button>
        <Divider bgColor="gray.300" />
        <HStack spacing={2} my={8} justifyContent="center">
          <Text color="gray.300">Don&apos;t have an account?</Text>
          <Link href="/signup">
            <Button variant="link" colorScheme="white">
              Sign Up
            </Button>
          </Link>
        </HStack>
      </Box>
    </Box>
  );
};

export default LoginPage;