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
  - `indexes` : 其它的索引值（可选）
    - `name` : 索引名称（必填）
    - `keyPath` : 索引键路径（必填）
    - `unique` : 是否唯一索引（可选，布尔值）

示例配置：
```typescript
const dbConfig: DBConfig = {
    name: "MyAppDB",
    version: 1,
    stores: [
        {
            name: "users",
            keyPath: "id",
            autoIncrement: false,
            indexes: [
                { name: "nameIndex", keyPath: "name", unique: false },  // 按姓名索引（非唯一）
                { name: "emailIndex", keyPath: "email", unique: true }   // 按邮箱索引（唯一）
            ]
        }
    ]
};
```

## 索引优先操作
### 使用索引获取数据
通过指定`indexName`参数，可优先使用索引查询数据（适用于唯一索引）：
```typescript
// 通过邮箱索引获取用户（唯一索引）
const user = await dbWrapper.get("users", "user@example.com", "emailIndex");
```

### 使用索引更新数据
对于非唯一索引，需先通过索引获取主键，再更新数据：
```typescript
// 通过姓名索引更新用户信息（非唯一索引需处理可能的多条数据）
const users = await dbWrapper.getByIndexAll("users", "nameIndex", "John");
if (users.length > 0) {
    const updatedUser = { ...users[0], age: 30 };
    await dbWrapper.put("users", updatedUser, "nameIndex");
}
```

### 使用索引删除数据
通过索引定位并删除数据：
```typescript
// 通过邮箱索引删除用户（唯一索引）
await dbWrapper.delete("users", "user@example.com", "emailIndex");
```

### 注意事项
- 索引操作需确保索引已在`DBConfig`中配置，否则会抛出错误
- 唯一索引（`unique: true`）使用`get`方法可直接获取单条数据，非唯一索引需使用`getByIndexAll`获取多条
- 通过索引更新/删除时，若未找到对应主键会抛出"未通过索引找到对应的主键"错误

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
- 无索引：直接插入数据，主键由keyPath或autoIncrement决定
- 有索引：插入时会自动更新关联索引（无需额外传index参数，索引由DBConfig配置自动维护）

示例：
```typescript
const newUser = { id: 1, name: 'Alice', age: 30 };
const userId = await dbWrapper.add('users', newUser); // 无索引插入
console.log('插入的用户ID:', userId);
```

#### 查询数据(`get`)
- 无索引：传入存储对象名称和键值（keyPath对应的值）查询数据
- 有索引（仅适用于唯一索引）：传入存储对象名称、索引键值和索引名称查询数据

示例：
```typescript
// 无索引：通过键值查询（keyPath为"id"）
const userById = await dbWrapper.get('users', 1);
console.log('通过键值查询到的用户:', userById);

// 有索引（唯一索引）：通过邮箱索引查询
const userByEmail = await dbWrapper.get('users', 'user@example.com', 'emailIndex');
console.log('通过索引查询到的用户:', userByEmail);
```

#### 通过索引获取所有数据(`getByIndexAll`)
- 适用于非唯一索引，传入存储对象名称、索引名称和索引键值，获取所有匹配数据

示例：
```typescript
// 通过姓名索引（非唯一）获取所有名为"John"的用户
const johnUsers = await dbWrapper.getByIndexAll('users', 'nameIndex', 'John');
console.log('通过非唯一索引查询到的用户列表:', johnUsers);
```

#### 通过索引获取单个数据(`getByIndex`)
- 适用于唯一索引，传入存储对象名称、索引名称和索引键值，获取单个匹配数据

示例：
```typescript
// 通过邮箱索引（唯一）获取特定邮箱的用户
const userByEmail = await dbWrapper.getByIndex('users', 'emailIndex', 'user@example.com');
console.log('通过唯一索引查询到的用户:', userByEmail);
```

#### 通过索引范围获取数据(`getAllByIndexRange`)
- 传入存储对象名称、索引名称和键范围（IDBKeyRange），获取范围内所有匹配数据

示例：
```typescript
// 假设已配置年龄索引ageIndex（keyPath: 'age', unique: false）
const ageRange = IDBKeyRange.bound(25, 35); // 年龄范围25到35
const usersInAgeRange = await dbWrapper.getAllByIndexRange('users', 'ageIndex', ageRange);
console.log('年龄在25到35岁之间的用户:', usersInAgeRange);
```

#### 更新数据(`put`)
- 无索引：传入存储对象名称和完整数据（需包含keyPath值）更新数据
- 有索引（非唯一索引需先获取主键）：传入存储对象名称、新数据和索引名称更新数据

示例：
```typescript
// 无索引：通过键值更新
const updatedUser = { id: 1, name: 'Alice Smith', age: 31 };
const updateResult = await dbWrapper.put('users', updatedUser);
console.log('更新的用户ID:', updateResult);

// 有索引（非唯一索引）：先通过索引获取主键再更新
const users = await dbWrapper.getByIndexAll('users', 'nameIndex', 'John');
if (users.length > 0) {
    const updatedUser = { ...users[0], age: 30 };
    const updateResult = await dbWrapper.put('users', updatedUser, 'nameIndex'); // 传入索引名称
    console.log('通过索引更新的用户ID:', updateResult);
    }
```

#### 增量更新数据(`incrementalUpdate`)
- 传入存储对象名称、键值（keyPath对应的值）和部分数据（Partial<T>）更新部分字段

示例：
```typescript
// 增量更新用户年龄（仅更新age字段）
const updateResult = await dbWrapper.incrementalUpdate('users', 1, { age: 32 });
console.log('增量更新的用户ID:', updateResult);
```

#### 删除数据(`delete`)
- 无索引：传入存储对象名称和键值（keyPath对应的值）删除数据
- 有索引（仅适用于唯一索引）：传入存储对象名称、索引键值和索引名称删除数据

示例：
```typescript
// 无索引：通过键值删除
await dbWrapper.delete('users', 1);
console.log('用户删除成功');

// 有索引（唯一索引）：通过邮箱索引删除
await dbWrapper.delete('users', 'user@example.com', 'emailIndex');
console.log('通过索引删除用户成功');
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
| `add()`       | `storeName: string`, `data: T` | `Promise<IDBValidKey>` | 插入新数据（索引由DBConfig自动维护，无需额外传index参数）           |
| `get()`       | `storeName: string`, `key: IDBValidKey`, `indexName?: string` | `Promise<T \| undefined>` | 根据键或索引查询数据：无索引时使用键值（keyPath对应值）；有索引时（仅适用于唯一索引）使用索引键值和索引名称       |
| `put()`       | `storeName: string`, `data: T`, `indexName?: string` | `Promise<IDBValidKey>` | 更新现有数据：无索引时需包含keyPath值；有索引时（非唯一索引需先获取主键）使用索引名称定位主键       |
| `delete()`    | `storeName: string`, `key: IDBValidKey`, `indexName?: string` | `Promise<void>`        | 根据键或索引删除数据：无索引时使用键值；有索引时（仅适用于唯一索引）使用索引键值和索引名称       |
| `clear()`     | `storeName: string`   | `Promise<void>`         | 清空存储所有数据     |
| `getAll()`    | `storeName: string`   | `Promise<T[]>`          | 获取存储所有数据     |
| `incrementalUpdate()` | `storeName: string`, `key: IDBValidKey`, `partialData: Partial<T>` | `Promise<IDBValidKey>` | 增量更新部分字段（仅更新传入的部分数据） |
| `getAllByIndexRange()` | `storeName: string`, `indexName: string`, `range: IDBKeyRange` | `Promise<T[]>` | 通过索引范围获取所有匹配数据 |
| `getByIndexAll()` | `storeName: string`, `indexName: string`, `key: IDBValidKey` | `Promise<T[]>` | 通过索引获取所有匹配数据（适用于非唯一索引） |
| `getByIndex()` | `storeName: string`, `indexName: string`, `key: IDBValidKey` | `Promise<T | undefined>` | 通过索引获取单个匹配数据（适用于唯一索引） |
| `close()`     | -                     | `void`                  | 关闭数据库连接       |
| `deleteDB()`  | -                     | `void`                  | 销毁整个数据库       |

## 注意事项
- 数据库版本升级时，需通过 `setConfig` 更新版本号并重新调用 `open()` ，
  此时会触发 `onupgradeneeded` 事件，可在此事件中执行存储对象的迁移操作。
- 所有数据操作需在数据库打开（`open` 成功）后执行，否则会抛出 `数据库未打开` 错误。
- IndexedDB 操作是异步的，需通过 `Promise` 或 `async/await` 处理结果。
- 确保数据库配置对象 `DBConfig` 正确定义，否则可能导致数据库初始化失败。
- 索引修改限制 ：`IndexDB` 不支持直接修改索引的 `keyPath` 或 `unique` 属性，因此若需修改索引配置（如将 `unique` 从 `false` 改为 `true` ），需通过升级数据库版本（ `version` 递增）触发 `onupgradeneeded` 事件，先删除旧索引再创建新索引。
- 性能影响 ：索引会增加数据写入/更新的开销（需同步更新索引），建议仅对需要频繁查询的字段添加索引。

## 贡献
欢迎提交Issue或Pull Request，共同完善工具库功能！