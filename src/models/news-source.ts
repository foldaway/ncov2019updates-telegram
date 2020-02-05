import { Model } from 'sequelize';

class NewsSource extends Model {
  public id!: number;
  public name!: string;
}

export default NewsSource;
