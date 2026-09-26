export function getMsDosDate(date: Date) {
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear() - 1980;

  // bit: F          8           4        0
  //     |-- year --|-- month --|-- day --|
  return (year << 9) | (month << 5) | dayOfMonth;
}

export function getMsDosTime(date: Date) {
  const seconds = date.getUTCSeconds() >> 1;
  const minutes = date.getUTCMinutes();
  const hours = date.getUTCHours();

  // bit: F           A             4            0
  //     |-- hours --|-- minutes --|-- seconds --|
  return (hours << 0xB) | (minutes << 5) | seconds;
}
