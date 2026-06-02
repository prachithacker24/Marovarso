import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class NormalizationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    // Only run normalization for request body and query params
    if (metadata.type !== 'body' && metadata.type !== 'query') {
      return value;
    }

    if (value && typeof value === 'object') {
      return this.normalize(value);
    }

    return value;
  }

  private normalize(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalize(item));
    }

    const normalized: any = {};

    for (const key of Object.keys(obj)) {
      let val = obj[key];

      if (typeof val === 'string') {
        // 1. Trim leading and trailing whitespace
        val = val.trim();

        // 2. Remove extra spaces inside strings
        val = val.replace(/\s+/g, ' ');

        // 3. Lowercase emails
        if (key.toLowerCase().includes('email')) {
          val = val.toLowerCase();
        }

        // 4. Standardize phone number format
        // Cleans out spaces, hyphens, brackets but preserves leading '+'
        if (key.toLowerCase().includes('phonenumber')) {
          val = val.replace(/[\s\-()]/g, '');
        }

        normalized[key] = val;
      } else if (val && typeof val === 'object') {
        normalized[key] = this.normalize(val);
      } else {
        normalized[key] = val;
      }
    }

    return normalized;
  }
}
