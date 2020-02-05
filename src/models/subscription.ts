import { Model, Association } from 'sequelize';
import Region from './region';

class Subscription extends Model {
  public id!: number;
  public chatId!: number;
  public readonly region!: Region;

  public static associations: {
    region: Association<Subscription, Region>;
  };
}

export default Subscription;
