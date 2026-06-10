import { ApiProperty } from '@nestjs/swagger';

export class FieldChange {
  @ApiProperty({ description: 'The modified field name' })
  fieldName: string;

  @ApiProperty({ description: 'Previous value of the field', required: false })
  oldValue: string | null;

  @ApiProperty({ description: 'New value of the field', required: false })
  newValue: string | null;
}

export class ChangeHistory {
  @ApiProperty({ description: 'List of field changes detected' })
  changes: FieldChange[];

  @ApiProperty({ description: 'Timestamp of changes' })
  changedAt: Date;

  /**
   * Helper to dynamically calculate field-level differences from previous and current states.
   */
  static fromStates(
    previousState: any,
    currentState: any,
    changedAt: Date = new Date(),
  ): ChangeHistory {
    const changes: FieldChange[] = [];

    if (
      previousState &&
      currentState &&
      typeof previousState === 'object' &&
      typeof currentState === 'object'
    ) {
      const allKeys = new Set([
        ...Object.keys(previousState),
        ...Object.keys(currentState),
      ]);

      for (const key of allKeys) {
        const oldVal = previousState[key];
        const newVal = currentState[key];

        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes.push({
            fieldName: key,
            oldValue:
              oldVal !== undefined
                ? typeof oldVal === 'object' && oldVal !== null
                  ? JSON.stringify(oldVal)
                  : String(oldVal)
                : null,
            newValue:
              newVal !== undefined
                ? typeof newVal === 'object' && newVal !== null
                  ? JSON.stringify(newVal)
                  : String(newVal)
                : null,
          });
        }
      }
    }

    return {
      changes,
      changedAt,
    };
  }
}
