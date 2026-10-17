/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export function SupportMark(props: { className?: string }) {
  return (
    <svg
      viewBox='0 0 40 40'
      fill='none'
      aria-hidden='true'
      className={props.className}
    >
      <path
        d='M8 5h24a5 5 0 0 1 5 5v28l-9-5H8a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5Z'
        fill='currentColor'
      />
      <path
        d='M10 24c5 4 15 4 20 0'
        stroke='#243cf1'
        strokeWidth='2.5'
        strokeLinecap='round'
      />
    </svg>
  )
}
