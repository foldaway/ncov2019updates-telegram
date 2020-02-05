import { Model } from 'sequelize';

class Subscription extends Model {
  public id!: number;
  public chatId!: number;
}

export default Subscription;
