import os
os.add_dll_directory(r'C:\msys64\mingw64\bin')
import orderbook_cpp

book = orderbook_cpp.OrderBook()

# заполняем книгу обычными заявками
for i in range(1, 21):
    book.addLimitOrder(orderbook_cpp.Order(orderbook_cpp.Side.Buy, 100 - i, 50, i))
    book.addLimitOrder(orderbook_cpp.Order(orderbook_cpp.Side.Sell, 101 + i, 50, 100 + i))

decision_mid = (book.bestBid() + book.bestAsk()) / 2
print(f"Decision price: {decision_mid}")

metaorder = orderbook_cpp.MetaorderExecutor(orderbook_cpp.Side.Buy, 500, 20, 10000)

while not metaorder.isFinished():
    current_ask = book.bestAsk()
    child_order = metaorder.nextChildOrder(current_ask)
    book.processOrder(child_order)
    print(f"Child {metaorder.getExecutedSoFar()}/{metaorder.getTotalChildOrders()}: "
          f"bestBid={book.bestBid()}, bestAsk={book.bestAsk()}")

final_mid = (book.bestBid() + book.bestAsk()) / 2
print(f"Final price: {final_mid}")
print(f"Impact: {final_mid - decision_mid}")