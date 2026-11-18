import type { ReactNode } from 'react'

export type IconName =
  | 'bowl'
  | 'ball'
  | 'moon'
  | 'sun'
  | 'mic'
  | 'stop'
  | 'send'
  | 'sound'
  | 'mute'
  | 'chat'
  | 'heart'
  | 'bolt'
  | 'smile'
  | 'edit'
  | 'close'
  | 'camera'

const paths: Record<IconName, ReactNode> = {
  bowl: (
    <>
      <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" />
      <path d="M9 8c0-1.2 1-1.6 1-2.8M14 8c0-1.2 1-1.6 1-2.8" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6c2.8 3 2.8 9 0 12M18 6c-2.8 3-2.8 9 0 12" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
  send: <path d="M12 19.5V5M5.8 11.2 12 5l6.2 6.2" />,
  sound: (
    <>
      <path d="M4 10v4h3l4.5 3.8V6.2L7 10H4Z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" />
    </>
  ),
  mute: (
    <>
      <path d="M4 10v4h3l4.5 3.8V6.2L7 10H4Z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
  chat: <path d="M5 4.5h14a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-6.5L8 20.5V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z" />,
  bolt: <path d="M13 3 5.5 13.2h5.3L10 21l7.5-10.2h-5.3L13 3Z" />,
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 13.8a4 4 0 0 0 7 0M9.2 9.8h.01M14.8 9.8h.01" />
    </>
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  camera: (
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h1.6l1.2-1.8h6.4l1.2 1.8H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" />
      <circle cx="12" cy="12.8" r="3.2" />
    </>
  ),
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
