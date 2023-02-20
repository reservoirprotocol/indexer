import { fromBuffer } from "@/common/utils";
import {
  ActivitiesEntity,
  ActivitiesEntityInsertParams,
  ActivitiesEntityParams,
} from "@/models/activities/activities-entity";

// Define the fields required to create a new activity
export type UserActivitiesEntityInsertParams = ActivitiesEntityInsertParams & { address: string };

// Define the fields need to instantiate the entity
export type UserActivitiesEntityParams = ActivitiesEntityParams & { address: Buffer };

export class UserActivitiesEntity extends ActivitiesEntity {
  address: string;

  constructor(params: UserActivitiesEntityParams) {
    super(params);
    this.address = fromBuffer(params.address);
  }
}
