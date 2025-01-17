/* eslint-disable camelcase */
import { useCallback, useContext, useEffect, useState } from 'react'
import { KeyPairDMTP, MessageDMTP } from '../core'
import DMTPContext from '../providers/DMTPProvider'
import ApiServices from '../services/api'
import { io } from 'socket.io-client'
import { ethers } from 'ethers'
import { compareString } from '../utils'

const getOrCreateDMTPKeyPair = async ({
  setDMTPKeyPair,
  APIKey,
  dappAddress,
  signMessageAsync,
  signatureState,
  isDev
}: any) => {
  try {
    const [signatureData, setSignatureData] = signatureState
    let signDataPayload = {
      sign: '',
      address: ''
    }
    if (!signatureData) {
      signDataPayload = await signMessageAsync()
    } else {
      signDataPayload.address = signatureData.message
      signDataPayload.sign = signatureData.signature
    }
    const { address, sign } = signDataPayload
    if (isDev)
      console.log(
        `[DMTP SDK][useDMTPKeyPair][getDMTPKeyPair] Start get key pair from DMTP with address: ${address}`
      )

    await ApiServices.updateLoginInfo(
      {
        dappAddress
      },
      APIKey,
      `${sign}`,
      address
    )

    const res = await ApiServices.getKeyPair(APIKey, address)
    const result = res.data.data
    if (result) {
      const { private_key, public_key } = result as any

      const payload = {
        privateKey: KeyPairDMTP.decryptDMTPPrivateKey(private_key, `${sign}`),
        publicKey: public_key
      }
      setDMTPKeyPair(payload)
      if (isDev)
        console.log(
          `[DMTP SDK][useDMTPKeyPair][getDMTPKeyPair] Get key pair from DMTP success: ${JSON.stringify(
            payload
          )}`
        )
    } else {
      const keyPair = KeyPairDMTP.generateNewDMTPKeyPair()
      if (isDev)
        console.log(
          `[DMTP SDK][useDMTPKeyPair][getDMTPKeyPair] Not found key pair , generate new: ${JSON.stringify(
            keyPair
          )}`
        )
      await ApiServices.submitKeyPair(
        {
          private_key: KeyPairDMTP.encryptDMTPPrivateKey(
            `${sign}`,
            keyPair.DMTP_privateKey
          ),
          public_key: keyPair.DMTP_publicKey
        },
        APIKey,
        `${sign}`,
        address
      )
      setDMTPKeyPair({
        privateKey: keyPair.DMTP_privateKey,
        publicKey: keyPair.DMTP_publicKey
      })
      if (isDev)
        console.log(
          `[DMTP SDK][useDMTPKeyPair][getDMTPKeyPair] submit new key pair on DMTP: ${JSON.stringify(
            keyPair
          )}`
        )
    }
    const checkFriendRes = await ApiServices.checkFriend(
      APIKey,
      address,
      dappAddress
    )
    const isFriend = checkFriendRes.data.data
    if (!isFriend) {
      await ApiServices.addFriend(
        {
          dappAddress
        },
        APIKey,
        `${sign}`,
        address
      )
    }
    setSignatureData({
      signature: sign,
      message: address
    })
    localStorage.setItem('dmtp-signature', sign)
    localStorage.setItem('dmtp-message', address)
  } catch (error) {
    if (isDev)
      console.error(
        `[DMTP SDK][useDMTPKeyPair][getDMTPKeyPair] error: ${error}`
      )
    throw error
  }
}

const getProvider = () => {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return new ethers.providers.Web3Provider((window as any).ethereum)
  } else {
    return null // Or return fallback provider here
  }
}

const useSignMessage = () => {
  const context = useContext(DMTPContext)
  if (context === undefined) {
    throw new Error('useDMTPKeyPair must be used within a DMTPProvider')
  }

  const { isDev } = context
  return {
    signMessageAsync: async (): Promise<{
      sign: string
      address: string
    }> => {
      try {
        const provider = getProvider()
        if (!provider) {
          throw new Error('Provider not found')
        }
        const signer = provider.getSigner()
        const address = await (await signer.getAddress()).toLowerCase()
        if (isDev)
          console.log(
            `[DMTP SDK][useSignMessage][signMessageAsync] Sign message with address: ${address}`
          )

        const signature = await signer.signMessage(address)
        if (isDev)
          console.log(
            `[DMTP SDK][useSignMessage][signMessageAsync] Sign message result with signature: ${signature}`
          )
        return {
          sign: signature,
          address
        }
      } catch (error) {
        if (isDev)
          console.error(
            `[DMTP SDK][useSignMessage][signMessageAsync] error: ${error}`
          )
        throw error
      }
    }
  }
}

const getEthereum = () => {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return (window as any).ethereum
  } else {
    return null
  }
}

const useAccount = (): string | undefined => {
  const [address, setAddress] = useState<string | undefined>(undefined)
  const ethereum = getEthereum()

  const getSelectedAddress = async () => {
    try {
      if (ethereum) {
        const provider = new ethers.providers.Web3Provider(ethereum)
        const signer = provider.getSigner()
        const address = await signer.getAddress()
        setAddress(address)
      }
    } catch (error) {}
  }

  useEffect(() => {
    if (ethereum) {
      getSelectedAddress()
      ethereum.on('accountsChanged', function (accounts: any) {
        if (accounts && accounts.length > 0) setAddress(accounts[0])
      })
    }
  }, [ethereum])

  return address
}

const useConnectDMTP = () => {
  const context = useContext(DMTPContext)
  if (context === undefined) {
    throw new Error('useDMTPKeyPair must be used within a DMTPProvider')
  }

  const { dmtpKeyPairState, APIKey, dappAddress, signatureState, isDev } =
    context
  const [dmtpKeyPair, setDMTPKeyPair] = dmtpKeyPairState

  const { signMessageAsync } = useSignMessage() as any
  const address = useAccount()

  const getLocalSignatureAndMessage = async () => {
    const signFromLocal = localStorage.getItem('dmtp-signature')
    const addressFromLocal = localStorage.getItem('dmtp-message')
    if (signFromLocal && addressFromLocal && address) {
      const addressRecover = ethers.utils.verifyMessage(
        addressFromLocal,
        signFromLocal
      )
      const [, setSignatureData] = signatureState
      if (
        compareString(addressRecover, address) &&
        compareString(addressFromLocal, address)
      ) {
        setSignatureData({
          signature: signFromLocal,
          message: addressFromLocal
        })
        const res = await ApiServices.getKeyPair<{
          private_key: string
          public_key: string
        }>(APIKey, address)
        const result = res.data.data
        if (result) {
          const { private_key, public_key } = result

          const payload = {
            privateKey: KeyPairDMTP.decryptDMTPPrivateKey(
              private_key,
              `${signFromLocal}`
            ),
            publicKey: public_key
          }
          setDMTPKeyPair(payload)
          if (isDev)
            console.log(
              `[DMTP SDK][useDMTPKeyPair][getDMTPKeyPair] Get key pair from DMTP success: ${JSON.stringify(
                payload
              )}`
            )
        }
      } else {
        setSignatureData(null)
        setDMTPKeyPair(null)
      }
    }
  }

  useEffect(() => {
    getLocalSignatureAndMessage()
  }, [address])

  return {
    isConnectDMTP: !!dmtpKeyPair?.publicKey,
    connectDMTP: () =>
      getOrCreateDMTPKeyPair({
        setDMTPKeyPair,
        APIKey,
        // wallet_address: `${address}`.toLowerCase(),
        dappAddress,
        signMessageAsync,
        signatureState,
        isDev
      })
  }
}

const useSNS = () => {
  const context = useContext(DMTPContext)
  if (context === undefined) {
    throw new Error('useDMTPKeyPair must be used within a DMTPProvider')
  }

  const { isShowSNSState, APIKey, signatureState, socketState, isDev } = context
  const [, setIsShowSNS] = isShowSNSState
  const [signatureData] = signatureState
  const [socket, setSocket] = socketState

  const [snsData, setSNSData] = useState<{
    discord: boolean
    telegram: boolean
  } | null>(null)

  const socketDisconnect = useCallback(() => {
    if (socket) {
      socket.offAny()
      socket.disconnect()
      setSocket(undefined)
    }
  }, [socket])

  const getData = async () => {
    if (!signatureData) return
    try {
      if (isDev) console.info(`[DMTP SDK][useSNS][snsData] Start get SNS data`)
      const resSNS = await ApiServices.getSNS(
        APIKey,
        signatureData.signature,
        signatureData.message
      )
      setSNSData({
        discord: !!resSNS.data.data.discord,
        telegram: !!resSNS.data.data.telegram
      })
      if (isDev)
        console.info(
          `[DMTP SDK][useSNS][snsData] Get SNS data success: ${JSON.stringify(
            resSNS.data.data
          )}`
        )
      const client = io('https://dev.dmtp.tech', {
        transports: ['websocket'],
        autoConnect: false,
        reconnectionAttempts: 0,
        reconnection: true,
        auth: {
          api_key: APIKey,
          signature: signatureData.signature,
          message: signatureData.message
        },
        path: '/socket.io'
      })
      client.connect()

      client.on('connect', () => {
        if (isDev)
          console.info(`[DMTP SDK][useSNS][snsData] DMTP SDK Connected`)
      })
      client.on('connect_error', (err) => {
        if (isDev)
          console.error(
            `[DMTP SDK][useSNS][snsData] DMTP SDK connect_error due to ${err.message}`
          )
      })

      client.on('reconnect', () => {
        if (isDev)
          console.warn(`[DMTP SDK][useSNS][snsData] DMTP SDK reconnect`)
      })

      client.on('disconnect', (reason) => {
        if (isDev)
          console.warn(
            `[DMTP SDK][useSNS][snsData] DMTP SDK disconnect: ${reason}`
          )
      })
      setSocket(client)
    } catch (error) {
      if (isDev) console.error(`[DMTP SDK][useSNS][snsData] error: ${error}`)
      setSNSData(null)
    }
  }

  const verifyTelegram = async (otp: string) => {
    if (!signatureData) return
    try {
      const res = await ApiServices.verifyTelegram(
        APIKey,
        signatureData.signature,
        signatureData.message,
        otp
      )
      if (res.data.data) {
        await getData()
      }
      if (isDev)
        console.info(`[DMTP SDK][useSNS][verifyTelegram] verify success`)
    } catch (error) {
      if (isDev)
        console.error(`[DMTP SDK][useSNS][verifyTelegram] error: ${error}`)
    }
  }

  useEffect(() => {
    if (socket)
      socketListen('sns', (payload) => {
        if (isDev) console.info(`[DMTP SDK][useSNS][socket] sns: ${payload}`)
        setSNSData({
          discord: !!payload.discord,
          telegram: !!payload.telegram
        })
      })
    return () => {
      removeAllListeners('sns')
    }
  }, [socket])

  useEffect(() => {
    setSNSData(null)

    if (signatureData) {
      getData()
    }

    const handleOnline = () => {
      if (signatureData) {
        getData()
      }
    }

    const handleOffline = () => {
      socketDisconnect()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
      socketDisconnect()
    }
  }, [APIKey, signatureData])

  const socketListen = useCallback(
    (event: string, listener: (...args: any[]) => void) => {
      if (socket) {
        socket.on(event, listener)
      }
    },
    [socket]
  )

  const removeAllListeners = useCallback(
    (eventName: string) => {
      if (socket) {
        socket.removeAllListeners(eventName)
      }
    },
    [socket]
  )

  return {
    show: () => setIsShowSNS(true),
    hide: () => setIsShowSNS(false),
    snsData,
    verifyTelegram
  }
}

const useSendMessage = (onSuccess?: Function, onError?: Function) => {
  const context = useContext(DMTPContext)
  if (context === undefined) {
    throw new Error('useDMTPKeyPair must be used within a DMTPProvider')
  }

  const { dmtpKeyPairState, APIKey, signatureState } = context
  const [dmtpKeyPair] = dmtpKeyPairState
  const [signatureData] = signatureState
  return async (message: string, to_address: string) => {
    try {
      const res = await ApiServices.getKeyPair(APIKey, to_address)
      const result = res.data.data
      if (result) {
        const { public_key } = result as any
        if (dmtpKeyPair?.privateKey) {
          const sharedKey = KeyPairDMTP.getSharedKey(
            dmtpKeyPair.privateKey,
            public_key
          )
          const messageDataEncrypt = MessageDMTP.encryptMessage(
            {
              content: `<p class="whitespace-pre-line break-all">${message}</p>`,
              images: []
            },
            sharedKey
          )
          if (signatureData) {
            const resSendMessage = await ApiServices.sendMessage(
              {
                message_data: messageDataEncrypt,
                to_address
              },
              APIKey,
              `${signatureData.signature}`,
              `${signatureData.message}`
            )
            if (onSuccess) onSuccess(resSendMessage.data.data)
          } else throw new Error(`useDMTPKeyPair before send message`)
        } else throw new Error(`useDMTPKeyPair before send message`)
      } else {
        throw new Error(`${to_address} is not registered`)
      }
    } catch (error) {
      if (onError) onError(error)
    }
  }
}

export { useConnectDMTP, useSNS, useSendMessage, useAccount }
