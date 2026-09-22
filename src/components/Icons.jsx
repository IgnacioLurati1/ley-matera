// Íconos SVG propios (sin dependencias). Todos usan currentColor.
const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

const make = (paths) =>
  function Icon({ size = 22, ...rest }) {
    return (
      <svg {...base(size)} {...rest}>
        {paths}
      </svg>
    );
  };

export const CartIcon = make(
  <>
    <path d="M6 7h12l-1 13H7L6 7Z" />
    <path d="M9 7a3 3 0 0 1 6 0" />
  </>,
);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />);
export const MenuIcon = make(<path d="M4 7h16M4 12h16M4 17h16" />);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = make(<path d="M5 12h14" />);
export const TrashIcon = make(
  <>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
  </>,
);
export const ChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const ChevronRight = make(<path d="m9 6 6 6-6 6" />);
export const ArrowLeft = make(<path d="M19 12H5m6-6-6 6 6 6" />);
export const FilterIcon = make(<path d="M4 5h16l-6 8v5l-4 2v-7L4 5Z" />);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const PauseIcon = make(<path d="M9 5v14M15 5v14" />);
export const PlayIcon = make(<path d="M7 5l12 7-12 7V5Z" />);
export const EditIcon = make(
  <>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13 7 4 4" />
  </>,
);
export const StarIcon = make(<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9L12 3Z" />);
export const UploadIcon = make(<path d="M12 16V4m-5 5 5-5 5 5M4 20h16" />);
export const DownloadIcon = make(<path d="M12 4v12m-5-5 5 5 5-5M4 20h16" />);
export const LogoutIcon = make(<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />);
export const CheckIcon = make(<path d="m5 12 5 5 9-10" />);
export const TagIcon = make(
  <>
    <path d="M3 12V4h8l10 10-8 8L3 12Z" />
    <circle cx="7.5" cy="8.5" r="1.5" />
  </>,
);
export const SparkIcon = make(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const MoonIcon = make(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />);
export const SunIcon = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
export const MailIcon = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </>,
);
export const ChatIcon = make(<path d="M4 5h16v11H9l-5 4V5Z" />);

export function InstagramIcon({ size = 22, ...rest }) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WhatsAppIcon({ size = 22, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3a8.2 8.2 0 1 1 6.9 3.8Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1.1 2.7 11.4 11.4 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z" />
    </svg>
  );
}
