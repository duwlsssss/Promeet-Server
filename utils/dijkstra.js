class PriorityQueue {
  constructor() {
    this.queue = [];
  }
  enqueue(node, priority) {
    this.queue.push({ node, priority });
    this.queue.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.queue.shift();
  }
  isEmpty() {
    return this.queue.length === 0;
  }
}

/**
 * @param {Object} graph - {"강남_2": [{ node: "역삼_2", weight: 2 }, { node: "교대_2", weight: 3 }]}
 * @param {string} start - 시작 역 ID
 */
export function dijkstraWithPaths(graph, start) {
  const times = {};
  const prev = {};
  const visited = new Set();
  const pq = new PriorityQueue();

  Object.keys(graph).forEach((station) => {
    times[station] = Infinity;
    prev[station] = null;
  });

  // 초기화
  if (!graph[start]) return { times, getPath: () => [] };

  // 시작점 투입
  times[start] = 0;
  pq.enqueue(start, 0);

  while (!pq.isEmpty()) {
    // 대기열에서 가장 시간이 적게 걸리는 역을 꺼냄
    const { node: current, priority: currentDist } = pq.dequeue();

    // 이미 방문했거나, 더 짧은 경로를 이미 찾았다면 스킵
    if (visited.has(current)) continue;
    if (currentDist > times[current]) continue;

    // 이제 이 역의 최단 거리는 확정됨
    visited.add(current);

    // 현재 역과 연결된 주변 역(neighbor)들을 살펴봄
    (graph[current] ?? []).forEach(({ node: neighbor, weight }) => {
      // 새로운 예상 시간 = 현재까지 걸린 시간 + 다음 역까지의 시간
      const newTime = times[current] + weight;
      // 새로운 길이 기존에 알던 길보다 빠르면
      if (newTime < times[neighbor]) {
        times[neighbor] = newTime; // 최단 시간 업데이트
        prev[neighbor] = current; // 이 역은 `current`를 거쳐 오는 게 제일 빠르다고 기록
        pq.enqueue(neighbor, newTime); // 업데이트된 정보를 대기열에 다시 넣음
      }
    });
  }

  // 특정 목적지까지의 경로를 반환하는 함수
  const getPath = (target) => {
    const path = [];
    let curr = target;
    // target부터 시작해서 부모(prev)를 타고 올라감
    while (curr) {
      path.unshift(curr); // 배열의 앞에 추가_역순이까
      curr = prev[curr];
    }
    // 시작점까지 연결되어 있다면 경로 반환, 아니면 빈 배열
    return path[0] === start ? path : [];
  };

  return { times, getPath };
}
