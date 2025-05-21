# DB Help - IndexDB 辅助工具

## 简介
`db-help` 是一个基于 IndexedDB 的 TypeScript 封装库，
提供了简单易用的 API 用于操作浏览器本地数据库，支持数据库
创建、数据增删改查等常见操作。

---

## 安装
```bash
npm install @aaj/db-help
```
## 快速开始
### 1. 配置数据库
首先定义数据库配置对象 `DBConfig` ，包含以下字段：

- `name` : 数据库名称（必填）
- `version` : 数据库版本（必填，需为整数）
- `stores` : 存储对象（Object Store）配置数组（必填），每个存储对象包含：
  - `name` : 存储对象名称（必填）
  - `keyPath` : 数据的键路径（可选，字符串或字符串数组）
  - `autoIncrement` : 是否自增主键（可选，布尔值）

示例配置：
```typescript
const dbConfig = {
  name: 'MyDatabase',
  version: 1,
  stores: [
    { name: 'users', keyPath: 'id', autoIncrement: false },
    { name: 'posts', keyPath: 'postId', autoIncrement: true }
  ]
};
```

### 2. 初始化数据库
通过 `IndexDBWrapper` 类初始化实例，并调用 `open()` 方法打开数据库：
```typescript
import { IndexDBWrapper } from "@aaj/db-help";
const dbWrapper = new IndexDBWrapper(dbConfig);
let dbInstance;

try {
  dbInstance = await dbWrapper.open();
  console.log('数据库打开成功:', dbInstance);
} catch (error) {
  console.error('数据库打开失败:', error);
}
```

### 3. 数据操作
#### 插入数据(`add`)
```typescript
const newUser = { id: 1, name: 'Alice', age: 30 };
const userId = await dbWrapper.add('users', newUser);
console.log('插入的用户ID:', userId);
```

#### 查询数据(`get`)
```typescript
const user = await dbWrapper.get('users', 1);
console.log('查询到的用户:', user);
```

#### 更新数据(`put`)
```typescript
const updatedUser = { id: 1, name: 'Alice Smith', age: 31 };
const updateResult = await dbWrapper.put('users', updatedUser);
console.log('更新的用户ID:', updateResult);
```

#### 删除数据(`delete`)
```typescript
await dbWrapper.delete('users', 1);
console.log('用户删除成功');
```
#### 清空存储对象(`clear`)
```typescript
await dbWrapper.clear('users');
console.log('用户存储对象已清空');
```
#### 获取所有数据(`getAll`)
```typescript
const allUsers = await dbWrapper.getAll('users');
console.log('所有用户:', allUsers);
```
### 4. 关闭数据库
```typescript
dbWrapper.close();
console.log('数据库已关闭');
```
### 5. 销毁数据库
```typescript
dbWrapper.deleteDB();
console.log('数据库已销毁');
```

## API 文档
### `IndexDBWrapper` 类
#### 构造函数
`constructor(config: DBConfig)`
- `config`: 数据库配置对象
  - `name`: 数据库名称（string）
  - `version`: 数据库版本（number）
  - `stores`: 对象存储配置数组
    - `name`: 存储名称（string）
    - `keyPath?`: 键路径（string | string[]）
    - `autoIncrement?`: 自动递增（boolean）

#### 核心方法
| 方法名       | 参数                  | 返回值                  | 说明                 |
|--------------|-----------------------|-------------------------|----------------------|
| `open()`      | -                     | `Promise<IDBDatabase>`  | 打开/初始化数据库    |
| `add()`       | `storeName: string`, `data: T` | `Promise<IDBValidKey>` | 插入新数据           |
| `get()`       | `storeName: string`, `key: IDBValidKey` | `Promise<T \| undefined>` | 根据键查询数据       |
| `put()`       | `storeName: string`, `data: T` | `Promise<IDBValidKey>` | 更新现有数据         |
| `delete()`    | `storeName: string`, `key: IDBValidKey` | `Promise<void>`        | 根据键删除数据       |
| `clear()`     | `storeName: string`   | `Promise<void>`         | 清空存储所有数据     |
| `getAll()`    | `storeName: string`   | `Promise<T[]>`          | 获取存储所有数据     |
| `close()`     | -                     | `void`                  | 关闭数据库连接       |
| `deleteDB()`  | -                     | `void`                  | 销毁整个数据库       |

## 注意事项
- 数据库版本升级时，需通过 `setConfig` 更新版本号并重新调用 `open()` ，
  此时会触发 `onupgradeneeded` 事件，可在此事件中执行存储对象的迁移操作。
- 所有数据操作需在数据库打开（`open` 成功）后执行，否则会抛出 `数据库未打开` 错误。
- IndexedDB 操作是异步的，需通过 `Promise` 或 `async/await` 处理结果。
- 确保数据库配置对象 `DBConfig` 正确定义，否则可能导致数据库初始化失败。

## 贡献
欢迎提交Issue或Pull Request，共同完善工具库功能！