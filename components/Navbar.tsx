import {
  Avatar,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spacer,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Account, Avatars, Databases, Query, Storage } from 'appwrite';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useContext, useEffect, useMemo } from 'react';
import { BsBellFill } from 'react-icons/bs';
import { FiArrowLeft } from 'react-icons/fi';
import { MdMessage, MdTask } from 'react-icons/md';
import tinycolor from 'tinycolor2';
import { UserContext, useUser } from '../context/UserContext';
import { client } from '../utils/appwriteConfig';
const Navbar = ({ flexWidth }: { flexWidth: number }) => {
  const { currentUser, loading, setCurrentUser } = useUser();
  const queryClient = useQueryClient();
  const storage = useMemo(() => new Storage(client), []);
  const avatars: any = useMemo(() => new Avatars(client), []);
  const router = useRouter();
  const { id, slug } = router.query;

  const darkButtonRoutes = useMemo(
    () => [
      '/team/[id]',
      '/profile/[id]',
      '/profile/edit/[id]',
      '/team/[id]/dm/[slug]',
    ],
    []
  );
  const databases = useMemo(() => new Databases(client), []);
  const { data: teamPreference = { bg: '', description: '', name: '' } } =
    useQuery(
      [`teamPreferences-${id}`],
      async () => {
        try {
          const response = await databases.getDocument(
            process.env.NEXT_PUBLIC_DATABASE_ID as string,
            process.env.NEXT_PUBLIC_TEAMS_COLLECTION_ID as string,
            id as string
          );
          return response;
        } catch (error) {
          console.error('Error fetching team preferences:', error);
          throw error;
        }
      },
      {
        staleTime: 3600000,
        cacheTime: 3600000,
        enabled: !router.pathname.startsWith('/profile/[id]'),
      }
    );

  const {
    data: result = '',
    isLoading: resultLoading,
    isError: resultError,
  } = useQuery(
    [`teamProfileImage-${id}`, teamPreference],
    async () => {
      try {
        const promise = await storage.getFile(
          process.env.NEXT_PUBLIC_TEAM_PROFILE_BUCKET_ID as string,
          id as string
        );
        const timestamp = Date.now(); // Get the current timestamp
        const imageUrl = storage.getFilePreview(
          process.env.NEXT_PUBLIC_TEAM_PROFILE_BUCKET_ID as string,
          id as string
        );

        return `${imageUrl.toString()}&timestamp=${timestamp}`;
      } catch (error) {
        const result = avatars.getInitials(
          teamPreference.name as string,
          240,
          240,
          tinycolor(teamPreference.bg).lighten(20).toHex()
        );
        return result.toString();
      }
    },
    {
      staleTime: 3600000,
      cacheTime: 3600000,
      enabled: !router.pathname.startsWith('/profile/[id]'),
    }
  );

  const isDarkButtonRoute = useMemo(() => {
    return darkButtonRoutes.some((route) => router.pathname.startsWith(route));
  }, [darkButtonRoutes, router.pathname]);

  const handleLogOut = () => {
    const account = new Account(client);
    const promise = account.deleteSession('current');
    promise.then(
      function (response) {
        setCurrentUser(undefined);
      },
      function (error) {
        console.error(error);
      }
    );
  };

  const goBack = () => {
    router.back();
  };

  interface UnreadChat {
    teamId: string;
    teamName: string;
    unreadCount: number;
  }

  interface UnreadDirectChat {
    sender: string;
    sender_name: string;
    unreadCount: number;
  }

  //DIRECT CHAT NOTIF DATA HANDLERS
  // a. notifications reader
  const { data: unreadDirectChatsData = [] } = useQuery<UnreadDirectChat[]>(
    ['unreadDirectChats'],
    async () => {
      try {
        const response = await databases.listDocuments(
          process.env.NEXT_PUBLIC_DATABASE_ID as string,
          process.env
            .NEXT_PUBLIC_DIRECT_CHATS_NOTIFICATION_COLLECTION_ID as string,
          [
            Query.equal('readerId', currentUser.$id),
            Query.equal('isRead', false),
          ]
        );

        const unreadDirectChats: UnreadDirectChat[] = response.documents.reduce(
          (result: UnreadDirectChat[], document: any) => {
            const { sender, sender_name } = document;

            const existingSender = result.find(
              (unread) => unread.sender === sender
            );

            if (existingSender) {
              existingSender.unreadCount++;
            } else {
              result.push({
                sender,
                sender_name,
                unreadCount: 1,
              });
            }

            return result;
          },
          []
        );

        return unreadDirectChats;
      } catch (error) {
        console.error('Error fetching direct messages notifications:', error);
        throw error;
      }
    },
    {
      staleTime: 3600000,
      cacheTime: 3600000,
    }
  );

  // b. Subscriptions
  useEffect(() => {
    const unsubscribe = client.subscribe(
      `databases.${process.env.NEXT_PUBLIC_DATABASE_ID}.collections.${process.env.NEXT_PUBLIC_DIRECT_CHATS_NOTIFICATION_COLLECTION_ID}.documents`,
      (response) => {
        if (
          response.events.includes(
            `databases.${process.env.NEXT_PUBLIC_DATABASE_ID}.collections.${process.env.NEXT_PUBLIC_DIRECT_CHATS_NOTIFICATION_COLLECTION_ID}.documents.*.create`
          )
        ) {
          const payload = response.payload as {
            isRead: boolean;
            sender: string;
            sender_name: string;
            readerId: string;
          };
          queryClient.invalidateQueries([
            `directMessages-${payload.sender}-${payload.readerId}`,
          ]);
          // console.log(payload.teamId);
          if (payload?.sender !== currentUser?.$id) {
            queryClient.setQueryData(['unreadDirectChats'], (prevData: any) => {
              const existingSenderIndex = prevData.findIndex(
                (unread: any) => unread.sender === payload.sender
              );
              if (existingSenderIndex !== -1) {
                const updatedData = [...prevData];
                updatedData[existingSenderIndex] = {
                  ...updatedData[existingSenderIndex],
                  unreadCount: updatedData[existingSenderIndex].unreadCount + 1,
                };
                return updatedData;
              } else {
                const newData = [
                  ...prevData,
                  {
                    sender: payload.sender,
                    sender_name: payload.sender_name,
                    unreadCount: 1,
                  },
                ];
                return newData;
              }
            });
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [queryClient, id, currentUser]);
  //DIRECT CHAT NOTIF DATA HANDLERS

  //GROUP CHAT NOTIF DATA HANDLERS
  // a. notifications reader
  const { data: unreadChatsData = [] } = useQuery<UnreadChat[]>(
    ['unreadChats'],
    async () => {
      try {
        const response = await databases.listDocuments(
          process.env.NEXT_PUBLIC_DATABASE_ID as string,
          process.env.NEXT_PUBLIC_CHATS_NOTIFICATION_COLLECTION_ID as string,
          [
            Query.equal('readerId', currentUser.$id),
            Query.equal('isRead', false),
          ]
        );

        const unreadChats: UnreadChat[] = response.documents.reduce(
          (result: UnreadChat[], document: any) => {
            const { teamId, teamName } = document;

            const existingTeam = result.find((team) => team.teamId === teamId);

            if (existingTeam) {
              existingTeam.unreadCount++;
            } else {
              result.push({
                teamId,
                teamName,
                unreadCount: 1,
              });
            }

            return result;
          },
          []
        );

        return unreadChats;
      } catch (error) {
        console.error('Error fetching team messages:', error);
        throw error;
      }
    },
    {
      staleTime: 3600000,
      cacheTime: 3600000,
    }
  );
  // b. Subscriptions
  useEffect(() => {
    const unsubscribe = client.subscribe(
      `databases.${process.env.NEXT_PUBLIC_DATABASE_ID}.collections.${process.env.NEXT_PUBLIC_CHATS_NOTIFICATION_COLLECTION_ID}.documents`,
      (response) => {
        queryClient.invalidateQueries([`teamMessages-${id}`]);
        if (
          response.events.includes(
            `databases.${process.env.NEXT_PUBLIC_DATABASE_ID}.collections.${process.env.NEXT_PUBLIC_CHATS_NOTIFICATION_COLLECTION_ID}.documents.*.create`
          )
        ) {
          const payload = response.payload as {
            isRead: boolean;
            sender: string;
            teamName: string;
            teamId: string;
          };
          // console.log(payload.teamId);
          if (payload?.sender !== currentUser?.$id) {
            queryClient.setQueryData(['unreadChats'], (prevData: any) => {
              const teamId = payload.teamId;

              const existingTeamIndex = prevData.findIndex(
                (team: any) => team.teamId === teamId
              );
              if (existingTeamIndex !== -1) {
                const updatedData = [...prevData];
                updatedData[existingTeamIndex] = {
                  ...updatedData[existingTeamIndex],
                  unreadCount: updatedData[existingTeamIndex].unreadCount + 1,
                };
                return updatedData;
              } else {
                const newData = [
                  ...prevData,
                  {
                    teamId,
                    teamName: payload.teamName,
                    unreadCount: 1,
                  },
                ];
                return newData;
              }
            });
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [queryClient, id, currentUser]);
  //GROUP CHAT NOTIF DATA HANDLERS

  //get logged in user data
  const { data, isLoading, isError, error } = useQuery(
    [`userData-${currentUser.$id}`],
    async () => {
      try {
        const response = await axios.post('/api/getuser', {
          userId: currentUser.$id,
        });
        return response.data;
      } catch (error) {
        throw new Error('Failed to fetch user');
      }
    },
    { staleTime: 600000, cacheTime: 600000 }
  );

  //get logged in user profile image
  const {
    data: resultUserImage = '',
    isLoading: resultUserImageLoading,
    isError: resultUserImageError,
  } = useQuery(
    [`userProfileImage-${currentUser.$id}`, data],
    async () => {
      try {
        const promise = await storage.getFile(
          process.env.NEXT_PUBLIC_USER_PROFILE_BUCKET_ID as string,
          data.prefs.profileImageId
        );
        const timestamp = Date.now(); // Get the current timestamp
        const imageUrl = storage.getFilePreview(
          process.env.NEXT_PUBLIC_USER_PROFILE_BUCKET_ID as string,
          data.prefs.profileImageId
        );

        return `${imageUrl.toString()}`;
      } catch (error) {
        const result = avatars.getInitials(
          data.name as string,
          240,
          240,
          tinycolor(data.prefs.profileColor).lighten(20).toHex()
        );
        return result.toString();
      }
    },
    { staleTime: 600000, cacheTime: 600000, enabled: !!data }
  );

  //get data of user to dm
  const {
    data: dmUserData,
    isLoading: dmUserIsLoading,
    isError: dmUserIsError,
    error: dmUserError,
  } = useQuery(
    [`dmUserData`, slug],
    async () => {
      try {
        const response = await axios.post('/api/getuser', {
          userId: slug,
        });
        return response.data;
      } catch (error) {
        throw new Error('Failed to fetch dm user');
      }
    },
    { staleTime: 600000, cacheTime: 600000, enabled: !!slug }
  );

  const {
    data: dmUserImage = '',
    isLoading: dmUserImageLoading,
    isError: dmUserImageError,
  } = useQuery(
    [`dmUserProfileImage-${slug}`],
    async () => {
      try {
        const promise = await storage.getFile(
          process.env.NEXT_PUBLIC_USER_PROFILE_BUCKET_ID as string,
          dmUserData.prefs.profileImageId
        );
        const timestamp = Date.now(); // Get the current timestamp
        const imageUrl = storage.getFilePreview(
          process.env.NEXT_PUBLIC_USER_PROFILE_BUCKET_ID as string,
          dmUserData.prefs.profileImageId
        );

        return `${imageUrl.toString()}`;
      } catch (error) {
        const result = avatars.getInitials(
          dmUserData.name as string,
          240,
          240,
          tinycolor(dmUserData.prefs.profileColor).lighten(20).toHex()
        );
        return result.toString();
      }
    },
    { staleTime: 600000, cacheTime: 600000, enabled: !!dmUserData }
  );

  return (
    <Flex
      justifyContent="space-between"
      pr={4}
      align="center"
      bg={isDarkButtonRoute ? 'transparent' : 'gray.800'}
      color="white"
      h="16"
      w={`calc(100% - ${flexWidth}px)`}
      right="0"
      zIndex="999"
      pos="fixed"
    >
      <HStack>
        {router.pathname !== '/' && (
          <Tooltip label="Go Back" color="white">
            <IconButton
              ml={8}
              aria-label="Go Back"
              icon={<FiArrowLeft />}
              onClick={goBack}
              bg="gray.800"
              _hover={{ bg: 'gray.700' }}
              _active={{ bg: 'gray.700' }}
              borderRadius="full"
              color="white"
            />
          </Tooltip>
        )}
        {router.pathname.startsWith('/team/chat/[id]') && (
          <Link href={`/team/${id}`}>
            <HStack ml={4}>
              <Avatar
                borderWidth={2}
                borderColor={teamPreference.bg}
                h="10"
                w="10"
                src={result}
                mr={2}
              />
              <Text color="white">Team {teamPreference?.name}</Text>
            </HStack>
          </Link>
        )}
        {dmUserData && router.pathname.startsWith('/team/[id]/dm/[slug]') && (
          <Link href={`/team/${id}`}>
            <HStack ml={4}>
              <Avatar
                borderWidth={2}
                // borderColor={teamPreference.bg}
                h="10"
                w="10"
                src={dmUserImage}
                mr={2}
              />
              <Text color="white">{dmUserData.name}</Text>
            </HStack>
          </Link>
        )}
      </HStack>
      {!isDarkButtonRoute && <Spacer />}
      <HStack gap={4}>
        <Menu>
          <MenuButton
            as={IconButton}
            aria-label="notifications"
            icon={
              <Flex position="relative">
                <MdMessage size="24px" />
                {unreadDirectChatsData.length > 0 && (
                  <Box
                    position="absolute"
                    top="0px"
                    right="-4px"
                    px={2}
                    py={1}
                    borderRadius="full"
                    bg="red.500"
                    color="white"
                    fontSize="xs"
                    fontWeight="bold"
                    transform="translate(50%, -50%)"
                  >
                    {unreadDirectChatsData.length.toString()}
                  </Box>
                )}
              </Flex>
            }
            bg="gray.800"
            _hover={{ bg: 'gray.700' }}
            _active={{ bg: 'gray.700' }}
            variant="outline"
            border="none"
            size="md"
            borderRadius="full"
          />
          <MenuList p={2} border="none" borderRadius="md">
            {unreadDirectChatsData.length > 0 ? (
              unreadDirectChatsData.map((unreadChat) => (
                <Link
                  key={unreadChat.sender}
                  href={`/team/${id}/dm/${unreadChat.sender}`}
                >
                  <MenuItem borderRadius="md">
                    <Image
                      src="/notification_logo.svg"
                      alt="notification logo"
                      h="10"
                      mr={2}
                    />
                    {unreadChat.unreadCount === 1 ? (
                      <>1 new chat from {unreadChat.sender_name}</>
                    ) : (
                      <>
                        {unreadChat.unreadCount} new chats from{' '}
                        {unreadChat.sender_name}
                      </>
                    )}
                  </MenuItem>
                </Link>
              ))
            ) : (
              <Box p={4}>You have no new direct messages!</Box>
            )}
          </MenuList>
        </Menu>
        {/* <Menu>
          <MenuButton
            as={IconButton}
            aria-label="notifications"
            icon={
              <Flex position="relative">
                <MdTask size="24px" />
                {unreadChatsData.length > 0 && (
                  <Box
                    position="absolute"
                    top="0px"
                    right="-4px"
                    px={2}
                    py={1}
                    borderRadius="full"
                    bg="red.500"
                    color="white"
                    fontSize="xs"
                    fontWeight="bold"
                    transform="translate(50%, -50%)"
                  >
                    {unreadChatsData.length.toString()}
                  </Box>
                )}
              </Flex>
            }
            bg="gray.800"
            _hover={{ bg: 'gray.700' }}
            _active={{ bg: 'gray.700' }}
            variant="outline"
            border="none"
            size="md"
            borderRadius="full"
          />
          <MenuList p={2} border="none" borderRadius="md">
            {unreadChatsData.length > 0 ? (
              unreadChatsData.map((unreadChat) => (
                <Link
                  key={unreadChat.teamId}
                  href={`/team/chat/${unreadChat.teamId}`}
                >
                  <MenuItem borderRadius="md">
                    <Image
                      src="/notification_logo.svg"
                      alt="notification logo"
                      h="10"
                      mr={2}
                    />
                    {unreadChat.unreadCount === 1 ? (
                      <>1 new chat in {unreadChat.teamName}</>
                    ) : (
                      <>
                        {unreadChat.unreadCount} new chats in{' '}
                        {unreadChat.teamName}
                      </>
                    )}
                  </MenuItem>
                </Link>
              ))
            ) : (
              <Box p={4}>You have no new task notifications!</Box>
            )}
          </MenuList>
        </Menu> */}
        <Menu>
          <MenuButton
            as={IconButton}
            aria-label="notifications"
            icon={
              <Flex position="relative">
                <BsBellFill size="24px" />
                {unreadChatsData.length > 0 && (
                  <Box
                    position="absolute"
                    top="0px"
                    right="-4px"
                    px={2}
                    py={1}
                    borderRadius="full"
                    bg="red.500"
                    color="white"
                    fontSize="xs"
                    fontWeight="bold"
                    transform="translate(50%, -50%)"
                  >
                    {unreadChatsData.length.toString()}
                  </Box>
                )}
              </Flex>
            }
            bg="gray.800"
            _hover={{ bg: 'gray.700' }}
            _active={{ bg: 'gray.700' }}
            variant="outline"
            border="none"
            size="md"
            borderRadius="full"
          />
          <MenuList p={2} border="none" borderRadius="md">
            {unreadChatsData.length > 0 ? (
              unreadChatsData.map((unreadChat) => (
                <Link
                  key={unreadChat.teamId}
                  href={`/team/chat/${unreadChat.teamId}`}
                >
                  <MenuItem borderRadius="md">
                    <Image
                      src="/notification_logo.svg"
                      alt="notification logo"
                      h="10"
                      mr={2}
                    />
                    {unreadChat.unreadCount === 1 ? (
                      <>1 new chat in {unreadChat.teamName}</>
                    ) : (
                      <>
                        {unreadChat.unreadCount} new chats in{' '}
                        {unreadChat.teamName}
                      </>
                    )}
                  </MenuItem>
                </Link>
              ))
            ) : (
              <Box p={4}>You have no new group chat notifications!</Box>
            )}
          </MenuList>
        </Menu>
        <Menu>
          <MenuButton
            as={Button}
            borderRadius="full"
            bg={!isDarkButtonRoute ? 'transparent' : 'gray.800'}
            variant="styled"
            colorScheme="gray"
          >
            <HStack gap={2}>
              <Avatar src={resultUserImage} size="sm" />
              <Text ml={4} fontWeight="bold" color="white">
                {currentUser?.name}
              </Text>
            </HStack>
          </MenuButton>
          <MenuList p={2} border="none" borderRadius="md">
            <Link href={`/profile/${currentUser.$id}`}>
              <MenuItem borderRadius="md">Profile</MenuItem>
            </Link>
            <MenuItem onClick={handleLogOut} borderRadius="md">
              Logout
            </MenuItem>
          </MenuList>
        </Menu>
      </HStack>
    </Flex>
  );
};

export default Navbar;
