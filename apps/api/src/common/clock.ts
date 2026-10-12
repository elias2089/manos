export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  override now(): Date {
    return new Date();
  }
}
