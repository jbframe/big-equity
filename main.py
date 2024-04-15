from simulation import simulate_board


hero_hand = ['ad', 'ac', 'qd', 'jc', '2d']
villain_hand = ['as', '2c', '5c', '7s', '10s']

# No board cards
board=[]
print(f'hero_hand: {hero_hand}')
print(f'villain_hand: {villain_hand}')
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)


hero_hand = ['ad', 'ac', 'qd', '2d']
villain_hand = ['as', '2c', '5c', '7s']

# No board cards
board=[]
print(f'hero_hand: {hero_hand}')
print(f'villain_hand: {villain_hand}')
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)

hero_hand = ['ad', 'ac', 'qd', '2d']
villain_hand = ['as', '2c', '5c', '10s']

# No board cards
board=[]
print(f'hero_hand: {hero_hand}')
print(f'villain_hand: {villain_hand}')
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)


hero_hand = ['ad', 'ac', 'qd', '2d']
villain_hand = ['as', '2c', '9c', '10s']

# No board cards
board=[]
print(f'hero_hand: {hero_hand}')
print(f'villain_hand: {villain_hand}')
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)