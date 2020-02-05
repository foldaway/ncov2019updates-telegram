import { Sequelize, Model, DataTypes, BuildOptions } from 'sequelize';
import * as dotenv from 'dotenv';
import NewsSource from './models/news-source';
import News from './models/news';
import Subscription from './models/subscription';

dotenv.config();
const sequelize = new Sequelize(process.env.DATABASE_URL!);

NewsSource.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'news_source',
    underscored: true,
  }
);

News.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    link: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    writtenAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'news',
    underscored: true,
  }
);

Subscription.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    chatId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'subscription',
    underscored: true,
  }
);

News.belongsTo(NewsSource, {
  foreignKey: 'news_source_id',
});
NewsSource.hasMany(News, {
  sourceKey: 'id',
  as: 'source',
});

sequelize.sync({ force: true });

export { sequelize, News, NewsSource };
