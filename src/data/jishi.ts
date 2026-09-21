// ============================================================
// 复试机试模块数据（P2 · 独立赛道）
//
// 定位：**不做代码判题**。纯前端 PWA 无法安全执行任意语言代码，
// 硬做要么引服务端、要么用 wasm 沙箱，成本与收益不匹配。
// 所以这里只做三件真正有用的事：
//   1. 14 个必默写模板的**掌握状态追踪 + 默写计时**
//   2. 高频错误速查表 / 180 分钟考场手册（考前反复看）
//   3. 专题题单勾选（题目跳转到牛客 / PAT / 洛谷，不抓取内容）
//
// 素材来源：kaoyan-jishi-training/408复试机试训练计划.md
// ============================================================

export interface JishiTemplate {
  id: string
  no: number
  name: string
  /** 该模板最容易翻车的地方 */
  note: string
  /** 所属训练层：1 保命 / 2 得分 / 3 差距 */
  layer: 1 | 2 | 3
  /** 默写目标：分钟 */
  minutes: number
  /** 参考实现（C++17，考场可直接背） */
  code: string
}

export const JISHI_LAYER_INFO: Record<1 | 2 | 3, { name: string; share: string; desc: string }> = {
  1: { name: '第一层 · 保命', share: '占分 45%–55%', desc: '先把这一半分锁死，再谈难题' },
  2: { name: '第二层 · 得分', share: '占分 25%–35%', desc: '模板级熟练即可，不追求变式' },
  3: { name: '第三层 · 差距', share: '占分 10%–20%', desc: '最后练，边缘分' },
}

export const JISHI_TEMPLATES: JishiTemplate[] = [
  {
    id: 'tpl-01',
    no: 1,
    name: '多组输入 / EOF / 整行读入',
    note: '考场第一坑：格式错误占失分 30%',
    layer: 1,
    minutes: 3,
    code: `#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);                 // 关同步，IO 提速

    // (a) 未给组数，读到 EOF 为止
    int n;
    while (cin >> n) { /* ... */ }

    // (b) 先给组数 T
    int T; 
    if (cin >> T) {
        while (T--) { /* ... */ }
    }

    // (c) 整行读入：cin>> 之后必须吃掉残留换行
    string line;
    cin.ignore(numeric_limits<streamsize>::max(), '\\n');
    while (getline(cin, line)) {
        if (line.empty()) continue;
        stringstream ss(line);
        int x;
        while (ss >> x) { /* 逐个处理 */ }
    }
    return 0;
}`,
  },
  {
    id: 'tpl-02',
    no: 2,
    name: '手写快排 + sort 自定义 cmp',
    note: 'cmp 的返回值方向别写反：true 表示 a 排在 b 前面',
    layer: 1,
    minutes: 5,
    code: `// ---- 库函数 + 多关键字 ----
struct Node { int id, score; };
sort(v.begin(), v.end(), [](const Node& a, const Node& b) {
    if (a.score != b.score) return a.score > b.score; // 分数降序
    return a.id < b.id;                               // 同学号升序
});

// ---- 手写快排（Hoare 划分，防卡常）----
void qsort(int a[], int l, int r) {
    if (l >= r) return;
    int i = l - 1, j = r + 1, p = a[(l + r) >> 1];
    while (i < j) {
        do i++; while (a[i] < p);
        do j--; while (a[j] > p);
        if (i < j) swap(a[i], a[j]);
    }
    qsort(a, l, j);
    qsort(a, j + 1, r);
}`,
  },
  {
    id: 'tpl-03',
    no: 3,
    name: '二分查找（含上下界变体）',
    note: '区间开闭写反是 WA 重灾区；统一用左闭右开',
    layer: 2,
    minutes: 5,
    code: `// 第一个 >= x 的下标（左闭右开 [l, r)）
int lowerBound(const vector<int>& a, int x) {
    int l = 0, r = (int)a.size();
    while (l < r) {
        int m = l + (r - l) / 2;
        if (a[m] >= x) r = m;
        else           l = m + 1;
    }
    return l;                          // 可能等于 n（不存在）
}

// 第一个 > x 的下标
int upperBound(const vector<int>& a, int x) {
    int l = 0, r = (int)a.size();
    while (l < r) {
        int m = l + (r - l) / 2;
        if (a[m] > x) r = m;
        else          l = m + 1;
    }
    return l;
}

// 实数二分（求根）
double f(double x);
double solve(double lo, double hi) {
    for (int it = 0; it < 100; it++) {
        double mid = (lo + hi) / 2;
        if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return lo;
}`,
  },
  {
    id: 'tpl-04',
    no: 4,
    name: '链表反转 / 合并',
    note: '就地反转要注意保存 next，否则断链',
    layer: 2,
    minutes: 4,
    code: `struct ListNode { int val; ListNode* next; ListNode(int v): val(v), next(nullptr) {} };

// 迭代反转：pre / cur / nxt 三指针
ListNode* reverse(ListNode* head) {
    ListNode* pre = nullptr;
    ListNode* cur = head;
    while (cur) {
        ListNode* nxt = cur->next;
        cur->next = pre;
        pre = cur;
        cur = nxt;
    }
    return pre;
}

// 合并两个有序链表（哨兵节点，省掉一堆判空）
ListNode* merge(ListNode* a, ListNode* b) {
    ListNode dummy(0), *t = &dummy;
    while (a && b) {
        if (a->val <= b->val) { t->next = a; a = a->next; }
        else                  { t->next = b; b = b->next; }
        t = t->next;
    }
    t->next = a ? a : b;
    return dummy.next;
}`,
  },
  {
    id: 'tpl-05',
    no: 5,
    name: '二叉树：四种遍历 + 由两序重建',
    note: '重建题先在中序里定位根，再切左右子区间',
    layer: 2,
    minutes: 8,
    code: `struct TreeNode { int val; TreeNode *l, *r; TreeNode(int v): val(v), l(nullptr), r(nullptr) {} };

void preOrder(TreeNode* p) { if (!p) return; cout << p->val << ' '; preOrder(p->l); preOrder(p->r); }
void inOrder(TreeNode* p)  { if (!p) return; inOrder(p->l); cout << p->val << ' '; inOrder(p->r); }

// 层序
void levelOrder(TreeNode* root) {
    if (!root) return;
    queue<TreeNode*> q; q.push(root);
    while (!q.empty()) {
        TreeNode* p = q.front(); q.pop();
        cout << p->val << ' ';
        if (p->l) q.push(p->l);
        if (p->r) q.push(p->r);
    }
}

// 由前序 + 中序重建
TreeNode* build(vector<int>& pre, int pl, int pr, vector<int>& in, int il, int ir) {
    if (pl > pr) return nullptr;
    int rootVal = pre[pl];
    int k = il;
    while (in[k] != rootVal) k++;          // 根在中序里的位置
    TreeNode* root = new TreeNode(rootVal);
    int leftLen = k - il;
    root->l = build(pre, pl + 1, pl + leftLen, in, il, k - 1);
    root->r = build(pre, pl + leftLen + 1, pr, in, k + 1, ir);
    return root;
}`,
  },
  {
    id: 'tpl-06',
    no: 6,
    name: '并查集（路径压缩 + 按秩合并）',
    note: '初始化别忘 fa[i] = i；多组数据要重新初始化',
    layer: 2,
    minutes: 4,
    code: `int fa[100005], rnk[100005];

void init(int n) {
    for (int i = 1; i <= n; i++) { fa[i] = i; rnk[i] = 0; }
}

int find(int x) {                          // 路径压缩
    return fa[x] == x ? x : fa[x] = find(fa[x]);
}

bool unite(int a, int b) {                 // 按秩合并
    int ra = find(a), rb = find(b);
    if (ra == rb) return false;
    if (rnk[ra] < rnk[rb]) swap(ra, rb);
    fa[rb] = ra;
    if (rnk[ra] == rnk[rb]) rnk[ra]++;
    return true;
}`,
  },
  {
    id: 'tpl-07',
    no: 7,
    name: 'DFS / BFS 框架（网格 + 邻接表）',
    note: '深搜改宽搜可防爆栈；网格访问标记要在入队时打',
    layer: 2,
    minutes: 7,
    code: `const int dx[4] = {1, -1, 0, 0}, dy[4] = {0, 0, 1, -1};
int n, m;
char g[1005][1005];
bool vis[1005][1005];

void dfs(int x, int y) {                   // 网格深搜
    vis[x][y] = true;
    for (int d = 0; d < 4; d++) {
        int nx = x + dx[d], ny = y + dy[d];
        if (nx < 0 || nx >= n || ny < 0 || ny >= m) continue;
        if (vis[nx][ny] || g[nx][ny] == '#') continue;
        dfs(nx, ny);
    }
}

int bfs(int sx, int sy, int tx, int ty) {  // 网格最短路（步数）
    queue<pair<int,int>> q;
    vector<vector<int>> dist(n, vector<int>(m, -1));
    q.push({sx, sy}); dist[sx][sy] = 0;
    while (!q.empty()) {
        auto [x, y] = q.front(); q.pop();
        if (x == tx && y == ty) return dist[x][y];
        for (int d = 0; d < 4; d++) {
            int nx = x + dx[d], ny = y + dy[d];
            if (nx < 0 || nx >= n || ny < 0 || ny >= m) continue;
            if (dist[nx][ny] != -1 || g[nx][ny] == '#') continue;
            dist[nx][ny] = dist[x][y] + 1;   // 入队即标记
            q.push({nx, ny});
        }
    }
    return -1;
}

// 邻接表（链式前向星）
int head[100005], nxt[200005], to[200005], ecnt = 0;
void addEdge(int u, int v) { to[++ecnt] = v; nxt[ecnt] = head[u]; head[u] = ecnt; }`,
  },
  {
    id: 'tpl-08',
    no: 8,
    name: 'Dijkstra（堆优化）/ Floyd',
    note: 'Dijkstra 不能处理负边；和 / 距离一律 long long',
    layer: 3,
    minutes: 8,
    code: `typedef long long ll;
typedef pair<ll,int> P;                    // (距离, 点)
const ll INF = 4e18;

// 堆优化 Dijkstra：O(m log n)
vector<ll> dijkstra(int s, int n, vector<vector<pair<int,int>>>& g) {
    vector<ll> d(n + 1, INF);
    priority_queue<P, vector<P>, greater<P>> pq;
    d[s] = 0; pq.push({0, s});
    while (!pq.empty()) {
        auto [du, u] = pq.top(); pq.pop();
        if (du > d[u]) continue;           // 过期堆项，跳过
        for (auto [v, w] : g[u]) {
            if (d[u] + w < d[v]) {
                d[v] = d[u] + w;
                pq.push({d[v], v});
            }
        }
    }
    return d;
}

// Floyd：多源，O(n^3)，n <= 400 才可用
void floyd(vector<vector<ll>>& d, int n) {
    for (int k = 1; k <= n; k++)
        for (int i = 1; i <= n; i++)
            for (int j = 1; j <= n; j++)
                if (d[i][k] + d[k][j] < d[i][j])
                    d[i][j] = d[i][k] + d[k][j];
}`,
  },
  {
    id: 'tpl-09',
    no: 9,
    name: 'Kruskal 最小生成树',
    note: '排序 + 并查集；选满 n-1 条边就停',
    layer: 3,
    minutes: 5,
    code: `struct Edge { int u, v, w; };
bool cmp(const Edge& a, const Edge& b) { return a.w < b.w; }

ll kruskal(vector<Edge>& es, int n) {      // 返回 MST 权值和
    sort(es.begin(), es.end(), cmp);
    init(n);                                // 见 tpl-06
    ll sum = 0; int cnt = 0;
    for (auto& e : es) {
        if (unite(e.u, e.v)) {
            sum += e.w;
            if (++cnt == n - 1) break;
        }
    }
    return cnt == n - 1 ? sum : -1;         // -1 表示不连通
}`,
  },
  {
    id: 'tpl-10',
    no: 10,
    name: '拓扑排序',
    note: '入度为 0 入队；出队数 != n 说明有环',
    layer: 3,
    minutes: 5,
    code: `vector<int> topo(int n, vector<vector<int>>& g) {
    vector<int> indeg(n + 1, 0), order;
    for (int u = 1; u <= n; u++)
        for (int v : g[u]) indeg[v]++;

    queue<int> q;
    for (int i = 1; i <= n; i++)
        if (indeg[i] == 0) q.push(i);

    while (!q.empty()) {
        int u = q.front(); q.pop();
        order.push_back(u);
        for (int v : g[u])
            if (--indeg[v] == 0) q.push(v);
    }
    return order.size() == (size_t)n ? order : vector<int>{};  // 空 = 有环
}`,
  },
  {
    id: 'tpl-11',
    no: 11,
    name: '0/1 背包 + 完全背包',
    note: '一维滚动时：0/1 容量倒序，完全背包正序 —— 方向写反必错',
    layer: 2,
    minutes: 6,
    code: `// ---- 0/1 背包：每件最多取一次 → 容量**倒序** ----
int zeroOne(int n, int V, vector<int>& w, vector<int>& v) {
    vector<int> dp(V + 1, 0);
    for (int i = 0; i < n; i++)
        for (int c = V; c >= w[i]; c--)          // 倒序！
            dp[c] = max(dp[c], dp[c - w[i]] + v[i]);
    return dp[V];
}

// ---- 完全背包：每件可取无限次 → 容量**正序** ----
int complete(int n, int V, vector<int>& w, vector<int>& v) {
    vector<int> dp(V + 1, 0);
    for (int i = 0; i < n; i++)
        for (int c = w[i]; c <= V; c++)          // 正序！
            dp[c] = max(dp[c], dp[c - w[i]] + v[i]);
    return dp[V];
}`,
  },
  {
    id: 'tpl-12',
    no: 12,
    name: 'LIS / LCS',
    note: 'LIS 的 O(n log n) 写法维护的是「长度为 k 的最小结尾」',
    layer: 2,
    minutes: 6,
    code: `// LIS：O(n log n)，tails[k] = 长度 k+1 的最小结尾值
int lis(const vector<int>& a) {
    vector<int> tails;
    for (int x : a) {
        auto it = lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else                   *it = x;
    }
    return (int)tails.size();
}

// LCS：二维 DP，滚动数组省一维
int lcs(const string& a, const string& b) {
    int n = a.size(), m = b.size();
    vector<int> dp(m + 1, 0), pre(m + 1, 0);
    for (int i = 1; i <= n; i++) {
        pre = dp;
        for (int j = 1; j <= m; j++) {
            if (a[i-1] == b[j-1]) dp[j] = pre[j-1] + 1;
            else                  dp[j] = max(pre[j], dp[j-1]);
        }
    }
    return dp[m];
}`,
  },
  {
    id: 'tpl-13',
    no: 13,
    name: 'KMP next 数组',
    note: 'next[i] 是「前 i 个字符」的最长公共前后缀长度；下标从 0 写更不易错',
    layer: 3,
    minutes: 7,
    code: `// 下标从 0 开始：next[i] = s[0..i] 的最长相等前后缀长度
vector<int> buildNext(const string& p) {
    int m = p.size();
    vector<int> nxt(m, 0);
    for (int i = 1, k = 0; i < m; i++) {
        while (k > 0 && p[i] != p[k]) k = nxt[k - 1];
        if (p[i] == p[k]) k++;
        nxt[i] = k;
    }
    return nxt;
}

// 返回 s 中 p 的所有出现位置（0 基）
vector<int> kmp(const string& s, const string& p) {
    vector<int> res;
    if (p.empty()) return res;
    vector<int> nxt = buildNext(p);
    int n = s.size(), m = p.size();
    for (int i = 0, k = 0; i < n; i++) {
        while (k > 0 && s[i] != p[k]) k = nxt[k - 1];
        if (s[i] == p[k]) k++;
        if (k == m) {
            res.push_back(i - m + 1);
            k = nxt[k - 1];
        }
    }
    return res;
}`,
  },
  {
    id: 'tpl-14',
    no: 14,
    name: '数论全家桶：筛法 / GCD / 快速幂 / 进制',
    note: '快速幂的指数用 long long；取模前先转 ll 防溢出',
    layer: 1,
    minutes: 7,
    code: `const int MAXN = 1000006;
bool comp[MAXN];
vector<int> primes;

void sieve(int n) {                        // 线性筛，O(n)
    comp[0] = comp[1] = true;
    for (int i = 2; i <= n; i++) {
        if (!comp[i]) primes.push_back(i);
        for (int p : primes) {
            if ((ll)i * p > n) break;
            comp[i * p] = true;
            if (i % p == 0) break;
        }
    }
}

ll gcd(ll a, ll b) { return b ? gcd(b, a % b) : a; }
ll lcm(ll a, ll b) { return a / gcd(a, b) * b; }   // 先除后乘防溢出

ll qpow(ll a, ll e, ll mod) {              // 快速幂
    ll r = 1 % mod; a %= mod;
    while (e > 0) {
        if (e & 1) r = r * a % mod;
        a = a * a % mod;
        e >>= 1;
    }
    return r;
}

// 十进制 -> base 进制（base <= 36）
string toBase(ll n, int base) {
    if (n == 0) return "0";
    string s;
    while (n > 0) {
        int d = n % base;
        s += (d < 10 ? char('0' + d) : char('A' + d - 10));
        n /= base;
    }
    reverse(s.begin(), s.end());
    return s;
}`,
  },
]

// ============================================================
// 高频错误速查表
// ============================================================
export interface JishiErrorItem {
  symptom: string
  cause: string
  action: string
}

export const JISHI_ERRORS: JishiErrorItem[] = [
  {
    symptom: 'Compile Error',
    cause: '变量名与库函数冲突（y1、next、data、index、time）',
    action: '改名，避免单字母与系统库同名',
  },
  {
    symptom: 'Runtime Error',
    cause: '数组越界、除零、递归爆栈',
    action: '检查下标起点与上下界；数组开大留余量；深搜改宽搜',
  },
  {
    symptom: 'Wrong Answer（样例过）',
    cause: '输出格式不匹配、多组用例未清空全局数组、区间开闭写反',
    action: '逐字符比对样例；全局数组每组开始前清空；核对 > 与 >=',
  },
  {
    symptom: 'Time Limit Exceeded',
    cause: '算法复杂度过高、输入输出未优化',
    action: '加 ios::sync_with_stdio(false); cin.tie(NULL); 并降复杂度',
  },
  {
    symptom: '部分测试点通过',
    cause: '边界未覆盖',
    action: '补空输入、极值、重复元素用例',
  },
  {
    symptom: '结果莫名偏差',
    cause: '局部数组未初始化（随机值）、int 溢出',
    action: '数组定义在全局或显式初始化；和 / 距离 / 方案数默认 long long',
  },
  {
    symptom: '浮点精度出错',
    cause: '除法、开方',
    action: '能整数运算就用整数；必要时 long double',
  },
]

// ============================================================
// 考场 180 分钟操作手册
// ============================================================
export interface JishiPhase {
  stage: string
  time: string
  what: string
}

export const JISHI_PHASES: JishiPhase[] = [
  { stage: '① 通读全卷', time: '0–10′', what: '全部题目读一遍，标出「能立刻写」与「要卡」的，先定做题顺序再动手' },
  { stage: '② 拿下签到题', time: '10–30′', what: '最简单的一两道必须一次 AC，先把分数锁进兜里' },
  { stage: '③ 中档题 ×2', time: '30–90′', what: '每题限时 30 分钟；写完立刻提交，不要就地优化' },
  { stage: '④ 难题', time: '90–140′', what: '先交暴力版占位 —— 按测试点给分，暴力也有分' },
  { stage: '⑤ 回查收尾', time: '140–180′', what: '边界、格式、多组用例清空；确认每道题都提交过' },
]

export const JISHI_IRON_RULES: string[] = [
  '卡壳超过 15 分钟立刻跳过 —— 部分分比完美解值钱',
  '没有补全和网络，模板必须能凭记忆默写',
  '任何一题都先交一版能跑的代码：0 次提交等于 0 分',
]

// ============================================================
// 专题题单（只给平台链接，不抓取内容）
// ============================================================
export interface JishiDrill {
  id: string
  name: string
  week: string
  target: number
  links: { name: string; url: string }[]
}

export const JISHI_DRILLS: JishiDrill[] = [
  {
    id: 'd1',
    name: '输入输出与格式',
    week: 'W1',
    target: 30,
    links: [
      { name: '牛客 · 考研复试机试专题', url: 'https://www.nowcoder.com/ta/kaoyan' },
      { name: '洛谷 · 入门 IO', url: 'https://www.luogu.com.cn/problem/list?difficulty=1' },
    ],
  },
  {
    id: 'd2',
    name: '数组模拟 + 字符串处理',
    week: 'W2–W3',
    target: 20,
    links: [
      { name: '洛谷 · 字符串题单', url: 'https://www.luogu.com.cn/training/101' },
      { name: 'PAT 乙级', url: 'https://pintia.cn/problem-sets/994805260223102976/problems' },
    ],
  },
  {
    id: 'd3',
    name: '排序查找 + 栈队列 + 二叉树',
    week: 'W4–W5',
    target: 20,
    links: [
      { name: 'LeetCode 热题 HOT 100', url: 'https://leetcode.cn/problem-list/2cktkvj/' },
      { name: '洛谷 · 二叉树题单', url: 'https://www.luogu.com.cn/training/203' },
    ],
  },
  {
    id: 'd4',
    name: 'DFS / BFS + 递归回溯',
    week: 'W6–W7',
    target: 20,
    links: [
      { name: '洛谷 · 搜索题单', url: 'https://www.luogu.com.cn/training/108' },
      { name: '牛客 · KY 系列真题', url: 'https://www.nowcoder.com/ta/kaoyan' },
    ],
  },
  {
    id: 'd5',
    name: '贪心 + 基础 DP',
    week: 'W8–W9',
    target: 20,
    links: [
      { name: '洛谷 · 动态规划题单', url: 'https://www.luogu.com.cn/training/110' },
      { name: 'LeetCode · 动态规划', url: 'https://leetcode.cn/tag/dynamic-programming/' },
    ],
  },
  {
    id: 'd6',
    name: '基础图论 + 并查集',
    week: 'W10',
    target: 10,
    links: [
      { name: '洛谷 · 图论题单', url: 'https://www.luogu.com.cn/training/105' },
      { name: '北大百练 openjudge', url: 'http://bailian.openjudge.cn/' },
    ],
  },
  {
    id: 'd7',
    name: '限时套题模拟',
    week: 'W11',
    target: 9,
    links: [
      { name: '牛客 · 模拟赛', url: 'https://www.nowcoder.com/contestRoom' },
      { name: 'PTA · 习题集', url: 'https://pintia.cn/problem-sets' },
    ],
  },
]

// ============================================================
// 12 周节奏
// ============================================================
export interface JishiWeek {
  week: string
  topic: string
  target: string
  focus: string
}

export const JISHI_WEEKS: JishiWeek[] = [
  { week: 'W1', topic: '输入输出与格式', target: '30 题', focus: '只练 IO，把格式错误清零' },
  { week: 'W2–W3', topic: '数组模拟 + 字符串处理', target: '各 8–10 题', focus: 'getline / cin.ignore / stringstream 熟练' },
  { week: 'W4–W5', topic: '排序查找 + 栈队列 + 二叉树', target: '各 8–10 题', focus: '手写快排、二叉树遍历与重建' },
  { week: 'W6–W7', topic: 'DFS / BFS + 递归回溯', target: '各 8–10 题', focus: '网格搜索与状态去重' },
  { week: 'W8–W9', topic: '贪心 + 基础 DP', target: '各 8–10 题', focus: '背包、LIS、LCS 三种写法都要会' },
  { week: 'W10', topic: '基础图论 + 并查集', target: '8–10 题', focus: 'Dijkstra / Kruskal / 拓扑排序' },
  { week: 'W11', topic: '限时套题模拟', target: '每周 3 套', focus: '严格计时，每套后必复盘' },
  { week: 'W12', topic: '冲刺', target: '每天 1 套', focus: '只做限时套题与错题，不再学新算法' },
]

// ============================================================
// 各校机试形态（三档）
// ============================================================
export interface JishiSchool {
  tier: '一票否决' | '高权重计分' | '不量化但可见'
  school: string
  detail: string
}

export const JISHI_SCHOOLS: JishiSchool[] = [
  { tier: '一票否决', school: '北京大学', detail: '2 小时 / 4–5 题；调试通过题数为 0 不予进入面试，机试不计入复试总分（是门槛，不是分数）' },
  { tier: '一票否决', school: '厦门大学', detail: '180 分钟；机试 <60 分直接淘汰' },
  { tier: '一票否决', school: '中国矿业大学（徐州）', detail: '180 分钟 / 5 题；上机 <50 分或复试总分 <120 直接淘汰' },
  { tier: '一票否决', school: '中国科学技术大学', detail: '机考 120 分 + 面试 80 分（复试共 200 分）' },
  { tier: '高权重计分', school: '南方科技大学', detail: '2 小时 / 6 题；机试占复试 50%' },
  { tier: '高权重计分', school: '浙江大学', detail: '3 小时；机考 35% + 面试 65%' },
  { tier: '高权重计分', school: '复旦大学', detail: '150 分钟 / 3 题；机考占复试 30%' },
  { tier: '高权重计分', school: '南京大学', detail: '2 小时 / 4–5 题；机考 50 分（总分 300）' },
  { tier: '不量化但可见', school: '清华大学', detail: '4 小时 / 3 题，IOI 赛制；机考 100 分（总分 1000）' },
  { tier: '不量化但可见', school: '北京邮电大学', detail: 'PTA 平台，ACM 赛制排名；名义上不作量化，实为复试区分度最大部分' },
  { tier: '不量化但可见', school: '北京航空航天大学', detail: 'C 语言上机 2 小时；成绩当晚公布并影响面试分组；CCF-CSP 前 50% 可免' },
  { tier: '不量化但可见', school: '西安电子科技大学', detail: '2 小时 / 4–6 题；按测试用例逐点给分，暴力可得部分分' },
]

/** 保命提醒：动手之前先确认的三件事 */
export const JISHI_PREFLIGHT: { item: string; where: string; why: string }[] = [
  {
    item: '确认目标院校机试的权重与红线',
    where: '研究生院 / 学院官网「复试录取工作实施细则」近两年版本',
    why: '一票否决型（北大 0 题不进面试、厦大 <60 淘汰、矿大 <50 淘汰）与不量化型的投入完全不同量级',
  },
  {
    item: '确认语言、编译器标准、题量与时长',
    where: '同上的「上机考试说明」附件',
    why: '编译标准影响能不能用 auto、结构化绑定；部分院校强制 C++',
  },
  {
    item: '做一次裸环境自测',
    where: '本机',
    why: '关掉 IDE 补全、断开网络，默写「读入 n 个数排序输出」；10 分钟内一次 AC = 及格线',
  },
]
