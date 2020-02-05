import { Model, BelongsTo, Association } from 'sequelize';
import NewsSource from './news-source';

class News extends Model {
  public id!: number;
  public title!: string;
  public link!: string;
  public writtenAt!: Date;
  public readonly source!: NewsSource;

  public getSource!: BelongsTo<NewsSource>;

  public static associations: {
    source: Association<News, NewsSource>;
  };
}

export default News;
