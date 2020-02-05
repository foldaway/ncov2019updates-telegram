import { Model } from 'sequelize';

class Region extends Model {
  public id!: number;
  public name!: string;
}

export default Region;
