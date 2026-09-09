import { brand } from "../lib/brand";

export default function BrandMark({ logo = brand.logo }) {
  return (
    <span className="brand-mark">
      {logo ? (
        <img src={logo} alt="" aria-hidden="true" />
      ) : (
        <svg
          viewBox="0 0 40 40"
          width="66%"
          height="66%"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <g
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 33V13M31 33V13M9 13L20 5l11 8M9 34h22" />
          </g>
        </svg>
      )}
    </span>
  );
}
